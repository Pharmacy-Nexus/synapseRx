const { loadClinicalData } = require('../lib/data');
const { detectModeFromText, isGeneralKnowledgeQuestion, isMedicalInScope, isShortGreeting, greetingReply, isVagueHumanQuestion, vagueHumanClarificationReply, isContinuationRequest, outOfScopeReply } = require('../lib/detector');
const { localParseQuestion, inheritContextIfNeeded, getRecentContextText, inferMissingInfo } = require('../lib/parser');
const { normalizeDrugList } = require('../lib/normalizer');
const { retrieveEvidence, triageRisk } = require('../lib/engines');
const { buildEvidenceBrief } = require('../lib/evidenceBrief');
const { MODEL, API_URL, callFinalModel, relayNvidiaStream, localFallbackAnswer } = require('../lib/composer');
const { extractModelReply, handleSideAskRequest } = require('../lib/sideAskHandler');

const MODE_LABELS = {
  general_chat: 'General Chat',
  case_analysis: 'Case Analysis',
  drug_interaction: 'Drug Interaction',
  drug_reverse: 'Drug Reverse Interactive Training'
};

const DATA = loadClinicalData();

const MAX_BODY_BYTES = Number(process.env.NEXUS_MAX_BODY_BYTES || 1024 * 1024);

function httpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function byteLength(value = '') {
  return Buffer.byteLength(String(value), 'utf8');
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      try {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (byteLength(raw) > MAX_BODY_BYTES) return reject(httpError('Request body too large.', 413));
        return resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
      } catch (error) {
        return reject(error);
      }
    }

    let data = '';
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        req.destroy(httpError('Request body too large.', 413));
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function getAllowedOrigins() {
  const configured = (process.env.NEXUS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (process.env.NEXUS_PUBLIC_APP_URL) configured.push(process.env.NEXUS_PUBLIC_APP_URL.trim());
  if (process.env.VERCEL_URL) configured.push(`https://${process.env.VERCEL_URL.trim()}`);
  if (process.env.NODE_ENV !== 'production') {
    configured.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  return Array.from(new Set(configured.map(origin => origin.replace(/\/$/, ''))));
}

function setCors(req, res) {
  const origin = req.headers.origin ? String(req.headers.origin).replace(/\/$/, '') : '';
  const allowedOrigins = getAllowedOrigins();
  const isAllowed = !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin);

  res.setHeader('Vary', 'Origin');
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || allowedOrigins[0] || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  return isAllowed;
}

function getLatestUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') return String(messages[i].content || '');
  }
  return '';
}

function attachmentContext(messages = []) {
  const blocks = [];
  messages.forEach((message, index) => {
    const files = Array.isArray(message.attachments) ? message.attachments : [];
    if (!files.length) return;
    const fileText = files.map(file => {
      const header = `File: ${file.name || 'untitled'} | Type: ${file.type || 'unknown'} | Size: ${file.size || 0} bytes`;
      if (file.text) return `${header}\nContent:\n${file.text}`;
      return `${header}\nContent not extracted. The user must paste text or use supported text files for clinical interpretation.`;
    }).join('\n\n');
    blocks.push(`Attachments linked to message ${index + 1}:\n${fileText}`);
  });
  return blocks.length ? `\n\nAttachment context:\n${blocks.join('\n\n---\n\n')}` : '';
}

function quickAccessContext(body = {}) {
  const text = String(body.quickAccessContext || '').trim();
  if (!text) return '';
  return text.slice(0, 7000);
}

function safeParseJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function sendPlainText(res, text, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform'
  });
  res.end(text);
}


async function readProviderJson(upstream) {
  const raw = await upstream.text();
  try { return raw ? JSON.parse(raw) : {}; }
  catch { return { raw }; }
}


async function callFinalModelWithOneRetry(args) {
  let upstream = await callFinalModel(args);
  if (args.shouldStream) return upstream;
  if (!upstream.ok) return upstream;
  const data = await readProviderJson(upstream);
  const reply = extractModelReply(data);
  if (reply) return { ok: true, status: upstream.status, __json: data };
  const retry = await callFinalModel({
    ...args,
    modeInstruction: [
      args.modeInstruction,
      'Previous provider attempt returned empty text. Return one clean answer using the locked case facts and evidence only.'
    ].filter(Boolean).join('\n\n')
  });
  if (!retry.ok) return retry;
  const retryData = await readProviderJson(retry);
  return { ok: true, status: retry.status, __json: retryData };
}



function extractAlreadyClinical(text = '') {
  return /\b(patient|case|drug|medicine|medication|symptom|diagnosis|lab|labs|bleeding|seizure|unconscious|chest pain|breathing)\b|مريض|حالة|دواء|دوا|اعراض|أعراض|تحليل|تحاليل|نزيف|تشنج|اغماء|إغماء|اختناق|صدر|تنفس/.test(String(text || '').toLowerCase());
}

function resolveMode(selectedMode, detectedMode, latestUserText, options = {}) {
  const selected = MODE_LABELS[selectedMode] ? selectedMode : 'general_chat';
  const modeSource = options.modeSource === 'manual' ? 'manual' : 'auto';

  // A continuation belongs to the current conversation mode. Do not force it
  // into Case Analysis when the previous mode was Drug Interaction or Reverse.
  if (options.continuationRequest) return selected !== 'general_chat' ? selected : detectedMode;

  // An explicit user choice wins. Auto-detection is used only when the UI mode
  // was not manually selected for this turn.
  if (modeSource === 'manual') return selected;

  if (detectedMode !== 'general_chat') return detectedMode;
  if (selected === 'case_analysis' && !isGeneralKnowledgeQuestion(latestUserText)) return 'case_analysis';
  return 'general_chat';
}

module.exports = async (req, res) => {
  const corsAllowed = setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(corsAllowed ? 204 : 403).end();
  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.NVIDIA_API_KEY) return res.status(500).json({ error: 'AI service is not configured.' });

  try {
    const body = await parseRequestBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (body.sideAsk === true) return handleSideAskRequest(body, res);

    const latestUserText = getLatestUserText(messages);
    if (!latestUserText) return res.status(400).json({ error: 'No user message found.' });

    const shouldStream = body.stream !== false;

    if (isShortGreeting(latestUserText)) {
      const reply = greetingReply();
      res.setHeader('X-Nexus-Mode', 'general_chat');
      res.setHeader('X-Nexus-Risk', 'none');
      return shouldStream ? sendPlainText(res, reply) : res.status(200).json({ mode: 'general_chat', risk: 'none', reply });
    }

    if (isVagueHumanQuestion(latestUserText) && !extractAlreadyClinical(latestUserText)) {
      const reply = vagueHumanClarificationReply();
      res.setHeader('X-Nexus-Mode', 'case_analysis');
      res.setHeader('X-Nexus-Risk', 'clarification_needed');
      return shouldStream ? sendPlainText(res, reply) : res.status(200).json({ mode: 'case_analysis', risk: 'clarification_needed', reply });
    }

    const recentContextForScope = getRecentContextText(messages, 10);
    const continuationRequest = isContinuationRequest(latestUserText);
    if (!isMedicalInScope(latestUserText, DATA, recentContextForScope)) {
      const reply = outOfScopeReply(latestUserText);
      res.setHeader('X-Nexus-Mode', 'scope_guard');
      res.setHeader('X-Nexus-Risk', 'none');
      res.setHeader('X-Nexus-Hide-Suggestions', 'true');
      return shouldStream ? sendPlainText(res, reply) : res.status(200).json({ mode: 'scope_guard', risk: 'none', hideSuggestions: true, reply });
    }

    const detectionText = continuationRequest ? `${recentContextForScope}\n${latestUserText}` : latestUserText;
    const detectedMode = detectModeFromText(detectionText, DATA);
    const selectedMode = MODE_LABELS[body.mode] ? body.mode : 'general_chat';
    const mode = resolveMode(selectedMode, detectedMode, latestUserText, {
      continuationRequest,
      modeSource: body.modeSource
    });
    const attachmentText = attachmentContext(messages);
    const quickAccessText = quickAccessContext(body);
    const recentContextText = recentContextForScope;
    const continuationInstruction = continuationRequest
      ? 'The user is asking to continue or complete the previous answer. Resume from the cutoff point using the conversation context. Do not answer out of scope. Do not restart the whole case unless needed for clarity.'
      : '';

    let parsed = localParseQuestion({ text: latestUserText, mode, data: DATA });
    parsed.drugs = normalizeDrugList(parsed.drugs || [], DATA);
    parsed = inheritContextIfNeeded({ parsed, latestUserText, messages, data: DATA });
    parsed.missingCriticalInfo = Array.from(new Set([...(parsed.missingCriticalInfo || []), ...inferMissingInfo(parsed)]));

    const evidence = retrieveEvidence(parsed, DATA, `${latestUserText}\n${recentContextText}`);
    parsed.missingCriticalInfo = Array.from(new Set([
      ...(parsed.missingCriticalInfo || []),
      ...(evidence.missingRequiredInfo || [])
    ]));
    const triage = triageRisk(parsed, evidence, latestUserText, DATA);
    const { validation, conflictResolver, shadowCheck, pipelineContext } = buildEvidenceBrief({ mode, parsed, evidence, triage, latestUserText });

    let upstream;
    try {
      upstream = await callFinalModelWithOneRetry({
        mode,
        modeInstruction: [body.modeInstruction, continuationInstruction].filter(Boolean).join('\n\n'),
        messages,
        pipelineContext,
        attachmentText,
        quickAccessText,
        shouldStream
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        const fallbackReply = localFallbackAnswer({ parsed, evidence, triage, validation, reason: 'timeout' });
        res.setHeader('X-Nexus-Mode', mode);
        res.setHeader('X-Nexus-Risk', triage.level);
        res.setHeader('X-Nexus-Fallback', 'composer_timeout');
        return shouldStream ? sendPlainText(res, fallbackReply) : res.status(200).json({ mode, risk: triage.level, reply: fallbackReply, fallback: 'composer_timeout' });
      }
      throw error;
    }

    if (!upstream.ok) {
      const errorText = await upstream.text();
      const providerDetails = safeParseJson(errorText) || errorText.slice(0, 500);
      console.error('AI provider request failed', {
        status: upstream.status,
        model: MODEL,
        apiUrl: API_URL,
        details: providerDetails
      });

      // Some NVIDIA endpoints intermittently reject or fail streaming requests.
      // Do one automatic non-stream retry before showing any error to the user.
      if (shouldStream) {
        try {
          const retryUpstream = await callFinalModelWithOneRetry({
            mode,
            modeInstruction: [
              body.modeInstruction,
              continuationInstruction,
              'The previous provider streaming attempt failed. Return one concise clinical answer. Do not generate suggested questions.'
            ].filter(Boolean).join('\n\n'),
            messages,
            pipelineContext,
            attachmentText,
            quickAccessText,
            shouldStream: false
          });

          if (retryUpstream.ok) {
            const retryData = retryUpstream.__json || await retryUpstream.json();
            const retryReply = extractModelReply(retryData);
            if (retryReply) {
              res.setHeader('X-Nexus-Mode', mode);
              res.setHeader('X-Nexus-Risk', triage.level);
              res.setHeader('X-Nexus-Retry', 'non_stream_after_provider_failure');
              return res.status(200).json({
                mode,
                risk: triage.level,
                reply: retryReply,
                retry: 'non_stream_after_provider_failure',
                evidenceBrief: process.env.NEXUS_DEBUG_PIPELINE === 'true' ? pipelineContext : undefined
              });
            }
          } else {
            const retryErrorText = await retryUpstream.text().catch(() => '');
            console.error('AI provider non-stream retry failed', {
              status: retryUpstream.status,
              model: MODEL,
              apiUrl: API_URL,
              details: safeParseJson(retryErrorText) || retryErrorText.slice(0, 500)
            });
          }
        } catch (retryError) {
          console.error('AI provider non-stream retry crashed', retryError);
        }
      }

      const fallbackReply = localFallbackAnswer({ parsed, evidence, triage, validation, reason: 'provider_failed' });
      res.setHeader('X-Nexus-Mode', mode);
      res.setHeader('X-Nexus-Risk', triage.level);
      res.setHeader('X-Nexus-Fallback', 'provider_failed');
      return res.status(200).json({
        mode,
        risk: triage.level,
        reply: fallbackReply + '\n\n> [!INFO] The AI provider failed this turn, so Atom used the local safety layer. Check Vercel logs for provider status if this repeats.',
        fallback: 'provider_failed',
        evidenceBrief: process.env.NEXUS_DEBUG_PIPELINE === 'true' ? pipelineContext : undefined
      });
    }

    res.setHeader('X-Nexus-Mode', mode);
    res.setHeader('X-Nexus-Risk', triage.level);
    res.setHeader('X-Nexus-Parser', parsed.parser || 'local_tool_layer');
    if (shadowCheck?.enabled) res.setHeader('X-Nexus-Shadow', 'enabled');

    if (shouldStream && upstream.body) {
      const emptyStreamFallback = localFallbackAnswer({ parsed, evidence, triage, validation, reason: 'empty_response' });
      return relayNvidiaStream(upstream, res, emptyStreamFallback);
    }

    const data = upstream.__json || await upstream.json();
    const reply = extractModelReply(data) || localFallbackAnswer({ parsed, evidence, triage, validation, reason: 'empty_response' });
    return res.status(200).json({
      mode,
      risk: triage.level,
      reply,
      evidenceBrief: process.env.NEXUS_DEBUG_PIPELINE === 'true' ? pipelineContext : undefined
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error('API route error', error);
    return res.status(statusCode).json({
      error: statusCode === 413 ? 'Request body too large.' : 'Request could not be processed.'
    });
  }
};
