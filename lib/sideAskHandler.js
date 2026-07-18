const { callSideAskModel, SIDE_MODEL, API_URL } = require('./composer');

function safeParseJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function extractModelReply(data) {
  return String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '').trim();
}

function looksCorruptedSideAskReply(reply = '', question = '') {
  const text = String(reply || '').trim();
  const prompt = String(question || '');
  if (!text || text.length < 2) return true;
  const promptHasCjk = /[\u3040-\u30ff\u3400-\u9fff]/.test(prompt);
  const cjkCount = (text.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  if (!promptHasCjk && cjkCount > 6) return true;
  if (/(?:\bthe\b\s*){5,}/i.test(text)) return true;
  if (/(\b\w{1,8}\b)(?:\s+\1){4,}/i.test(text)) return true;
  if (/0\.1\s*(?:و|和|and)\s*0\.2/.test(text) && !/0\.1|0\.2/.test(prompt)) return true;
  return false;
}

async function readProviderJson(upstream) {
  const raw = await upstream.text();
  try { return raw ? JSON.parse(raw) : {}; }
  catch { return { raw }; }
}

async function handleSideAskRequest(body, res) {
  const question = String(body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'No Side Ask question found.' });

  try {
    let upstream = await callSideAskModel({ question });
    if (!upstream.ok) {
      const sideErrorText = await upstream.text().catch(() => '');
      console.error('Side Ask provider failed', {
        status: upstream.status,
        model: SIDE_MODEL,
        apiUrl: API_URL,
        details: safeParseJson(sideErrorText) || sideErrorText.slice(0, 500)
      });
      return res.status(502).json({ error: 'Side Ask AI provider failed. Check NVIDIA_API_KEY / NEXUS_SIDE_MODEL in Vercel.' });
    }

    let data = await readProviderJson(upstream);
    let reply = extractModelReply(data);

    if (looksCorruptedSideAskReply(reply, question)) {
      upstream = await callSideAskModel({ question, strict: true });
      if (upstream.ok) {
        data = await readProviderJson(upstream);
        const retryReply = extractModelReply(data);
        if (!looksCorruptedSideAskReply(retryReply, question)) reply = retryReply;
      }
    }

    if (looksCorruptedSideAskReply(reply, question)) {
      reply = 'Side Ask received a corrupted/unclear model output. Please resend the question in one clear sentence.';
    }

    res.setHeader('X-Nexus-Side-Ask', 'true');
    return res.status(200).json({ mode: 'side_ask', risk: 'none', reply });
  } catch (error) {
    if (error.name === 'AbortError') return res.status(504).json({ error: 'Side Ask timed out. Try a shorter question.' });
    throw error;
  }
}

module.exports = { extractModelReply, looksCorruptedSideAskReply, handleSideAskRequest };
