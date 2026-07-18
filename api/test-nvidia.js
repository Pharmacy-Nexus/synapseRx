const DEFAULT_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemma-4-31b-it';

function clean(value, fallback = '') {
  const text = String(value || '').trim().replace(/^["']|["']$/g, '');
  return text || fallback;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!process.env.NVIDIA_API_KEY) {
    return res.status(500).json({ ok: false, stage: 'configuration', error: 'NVIDIA_API_KEY is missing in this deployment environment.' });
  }

  const model = clean(process.env.NVIDIA_MODEL, DEFAULT_MODEL);
  const apiUrl = clean(process.env.NVIDIA_API_URL, DEFAULT_API_URL);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = 25000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: Connection working' }],
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 32,
        stream: false
      })
    });

    const raw = await response.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch {}

    const reply = String(parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || '').trim();
    return res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      stage: 'provider_response',
      status: response.status,
      durationMs: Date.now() - startedAt,
      model,
      apiHost: (() => { try { return new URL(apiUrl).host; } catch { return 'invalid-url'; } })(),
      reply,
      providerBody: parsed || raw.slice(0, 3000)
    });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return res.status(timedOut ? 504 : 500).json({
      ok: false,
      stage: timedOut ? 'provider_timeout' : 'network_error',
      durationMs: Date.now() - startedAt,
      timeoutMs,
      model,
      error: error?.message || String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
};
