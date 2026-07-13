function clean(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    build: 'atom-v5.19-direct-provider-diagnostic',
    deployment: {
      vercelUrl: process.env.VERCEL_URL || null,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null
    },
    provider: {
      hasNvidiaKey: Boolean(process.env.NVIDIA_API_KEY),
      model: clean(process.env.NVIDIA_MODEL) || null,
      sideModel: clean(process.env.NEXUS_SIDE_MODEL) || null,
      apiUrl: clean(process.env.NVIDIA_API_URL) || '(composer default)',
      timeout: process.env.NEXUS_COMPOSER_TIMEOUT_MS || null,
      maxTokens: process.env.NVIDIA_MAX_TOKENS || null,
      temperature: process.env.NVIDIA_TEMPERATURE || null,
      topP: process.env.NVIDIA_TOP_P || null
    }
  });
};
