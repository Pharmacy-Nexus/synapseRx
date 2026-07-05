const { callSideAskModel } = require('../lib/composer');

const MAX_BODY_BYTES = Number(process.env.NEXUS_SIDEASK_MAX_BODY_BYTES || 128 * 1024);

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
        if (byteLength(raw) > MAX_BODY_BYTES) return reject(httpError('Side Ask request body too large.', 413));
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
        req.destroy(httpError('Side Ask request body too large.', 413));
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

module.exports = async (req, res) => {
  const corsAllowed = setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(corsAllowed ? 204 : 403).end();
  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.NVIDIA_API_KEY) return res.status(500).json({ error: 'AI service is not configured. Add NVIDIA_API_KEY in Vercel Environment Variables.' });

  try {
    const body = await parseRequestBody(req);
    const question = String(body.question || '').trim();
    if (!question) return res.status(400).json({ error: 'No Side Ask question found.' });

    const upstream = await callSideAskModel({ question });
    const text = await upstream.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch { data = { raw: text }; }

    if (!upstream.ok) {
      console.error('Side Ask provider failed', { status: upstream.status, body: String(text || '').slice(0, 500) });
      return res.status(502).json({ error: `Side Ask AI provider failed (${upstream.status}). Check NVIDIA_API_KEY, NVIDIA_MODEL, and model access.` });
    }

    const reply = data?.choices?.[0]?.message?.content || 'I could not answer that side question right now.';
    res.setHeader('X-Nexus-Side-Ask', 'true');
    return res.status(200).json({ mode: 'side_ask', reply });
  } catch (error) {
    console.error('Side Ask route error:', error);
    if (error.name === 'AbortError') return res.status(504).json({ error: 'Side Ask timed out. Try a shorter question.' });
    return res.status(error.statusCode || 500).json({ error: error.message || 'Side Ask failed.' });
  }
};
