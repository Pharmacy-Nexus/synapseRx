const { loadClinicalData } = require('../lib/data');
const { detectModeFromText, isGeneralKnowledgeQuestion, isMedicalInScope, isShortGreeting, greetingReply, isVagueHumanQuestion, vagueHumanClarificationReply, outOfScopeReply } = require('../lib/detector');
const { localParseQuestion, inheritContextIfNeeded, getRecentContextText, inferMissingInfo } = require('../lib/parser');
const { normalizeDrugList } = require('../lib/normalizer');
const { retrieveEvidence, triageRisk } = require('../lib/engines');
const { buildEvidenceBrief } = require('../lib/evidenceBrief');
const { callFinalModel, callSideAskModel, relayNvidiaStream, localFallbackAnswer } = require('../lib/composer');

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


function extractAlreadyClinical(text = '') {
  return /\b(patient|case|drug|medicine|medication|symptom|diagnosis|lab|labs|bleeding|seizure|unconscious|chest pain|breathing)\b|مريض|حالة|دواء|دوا|اعراض|أعراض|تحليل|تحاليل|نزيف|تشنج|اغماء|إغماء|اختناق|صدر|تنفس/.test(String(text || '').toLowerCase());
}

function resolveMode(selectedMode, detectedMode, latestUserText) {
  let mode = MODE_LABELS[selectedMode] ? selectedMode : 'general_chat';
  // Strong tool signals auto-switch the UI and response style.
  if (detectedMode !== 'general_chat') mode = detectedMode;
  // A user-selected Case mode stays Case unless the text is clearly general knowledge.
  if (selectedMode === 'case_analysis' && detectedMode === 'general_chat' && !isGeneralKnowledgeQuestion(latestUserText)) mode = 'case_analysis';
  // General medical/pharmacy education is not a case.
  if (isGeneralKnowledgeQuestion(latestUserText) && detectedMode === 'general_chat') mode = 'general_chat';
  return mode;
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
    const latestUserText = getLatestUserText(messages);
    if (!latestUserText) return res.status(400).json({ error: 'No user message found.' });

    const shouldStream = body.stream !== false;

    if (body.sideAsk === true) {
      const question = String(body.question || latestUserText || '').trim();
      if (!question) return res.status(400).json({ error: 'No Side Ask question found.' });
      try {
        const upstream = await callSideAskModel({ question });
        if (!upstream.ok) {
          console.error('Side Ask provider failed', { status: upstream.status });
          return res.status(502).json({ error: 'Side Ask could not generate a response. Please retry.' });
        }
        const data = await upstream.json();
        const reply = data?.choices?.[0]?.message?.content || 'I could not answer that side question right now.';
        res.setHeader('X-Nexus-Side-Ask', 'true');
        return res.status(200).json({ mode: 'side_ask', risk: 'none', reply });
      } catch (error) {
        if (error.name === 'AbortError') return res.status(504).json({ error: 'Side Ask timed out. Try a shorter question.' });
        throw error;
      }
    }


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

    const recentContextForScope = getRecentContextText(messages, 8);
    if (!isMedicalInScope(latestUserText, DATA, recentContextForScope)) {
      const reply = outOfScopeReply(latestUserText);
      res.setHeader('X-Nexus-Mode', 'scope_guard');
      res.setHeader('X-Nexus-Risk', 'none');
      return shouldStream ? sendPlainText(res, reply) : res.status(200).json({ mode: 'scope_guard', risk: 'none', reply });
    }

    const detectedMode = detectModeFromText(latestUserText, DATA);
    const selectedMode = MODE_LABELS[body.mode] ? body.mode : 'general_chat';
    const mode = resolveMode(selectedMode, detectedMode, latestUserText);
    const attachmentText = attachmentContext(messages);
    const quickAccessText = quickAccessContext(body);
    const recentContextText = recentContextForScope;

    let parsed = localParseQuestion({ text: latestUserText, mode, data: DATA });
    parsed.drugs = normalizeDrugList(parsed.drugs || [], DATA);
    parsed = inheritContextIfNeeded({ parsed, latestUserText, messages, data: DATA });
    parsed.missingCriticalInfo = Array.from(new Set([...(parsed.missingCriticalInfo || []), ...inferMissingInfo(parsed)]));

    const evidence = retrieveEvidence(parsed, DATA, `${latestUserText}\n${recentContextText}`);
    const triage = triageRisk(parsed, evidence, latestUserText, DATA);
    const { validation, conflictResolver, shadowCheck, pipelineContext } = buildEvidenceBrief({ mode, parsed, evidence, triage, latestUserText });

    let upstream;
    try {
      upstream = await callFinalModel({
        mode,
        modeInstruction: body.modeInstruction,
        messages,
        pipelineContext,
        attachmentText,
        quickAccessText,
        shouldStream
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        const fallbackReply = localFallbackAnswer({ parsed, evidence, triage, validation });
        res.setHeader('X-Nexus-Mode', mode);
        res.setHeader('X-Nexus-Risk', triage.level);
        res.setHeader('X-Nexus-Fallback', 'composer_timeout');
        return shouldStream ? sendPlainText(res, fallbackReply) : res.status(200).json({ mode, risk: triage.level, reply: fallbackReply, fallback: 'composer_timeout' });
      }
      throw error;
    }

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error('AI provider request failed', {
        status: upstream.status,
        details: safeParseJson(errorText) || errorText.slice(0, 500)
      });
      return res.status(502).json({
        error: 'AI service failed to generate a response. Please retry.',
        pipeline: process.env.NEXUS_DEBUG_PIPELINE === 'true' ? pipelineContext : undefined
      });
    }

    res.setHeader('X-Nexus-Mode', mode);
    res.setHeader('X-Nexus-Risk', triage.level);
    res.setHeader('X-Nexus-Parser', parsed.parser || 'local_tool_layer');
    if (shadowCheck?.enabled) res.setHeader('X-Nexus-Shadow', 'enabled');

    if (shouldStream && upstream.body) {
      const emptyStreamFallback = localFallbackAnswer({ parsed, evidence, triage, validation });
      return relayNvidiaStream(upstream, res, emptyStreamFallback);
    }

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content || localFallbackAnswer({ parsed, evidence, triage, validation });
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
