const { handleSideAskRequest } = require('../lib/sideAskHandler');

const MAX_BODY_BYTES = Number(process.env.NEXUS_SIDEASK_MAX_BODY_BYTES || 128 * 1024);

function byteLength(value = '') {
  return Buffer.byteLength(String(value), 'utf8');
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      try {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (byteLength(raw) > MAX_BODY_BYTES) return reject(Object.assign(new Error('Side Ask request body too large.'), { statusCode: 413 }));
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
        reject(Object.assign(new Error('Side Ask request body too large.'), { statusCode: 413 }));
        req.destroy();
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

function setCors(req, res) {
  const configured = (process.env.NEXUS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (process.env.NEXUS_PUBLIC_APP_URL) configured.push(process.env.NEXUS_PUBLIC_APP_URL.trim().replace(/\/$/, ''));
  if (process.env.VERCEL_URL) configured.push(`https://${process.env.VERCEL_URL.trim()}`);

  const origin = req.headers.origin ? String(req.headers.origin).replace(/\/$/, '') : '';
  const isAllowed = !origin || configured.length === 0 || configured.includes(origin);
  res.setHeader('Vary', 'Origin');
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || configured[0] || '*');
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
  if (!process.env.NVIDIA_API_KEY) return res.status(500).json({ error: 'AI service is not configured.' });

  try {
    const body = await parseRequestBody(req);
    return handleSideAskRequest({ ...body, sideAsk: true }, res);
  } catch (error) {
    console.error('Side Ask route error', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Side Ask failed.' });
  }
};
