const { loadClinicalData } = require('../lib/data');

function clean(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

module.exports = async (req, res) => {
  const data = loadClinicalData();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    build: 'atom-v5.20-structured-data-engine',
    deployment: {
      vercelUrl: process.env.VERCEL_URL || null,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null
    },
    provider: {
      hasNvidiaKey: Boolean(process.env.NVIDIA_API_KEY),
      model: clean(process.env.NVIDIA_MODEL) || '(composer default)',
      sideModel: clean(process.env.NEXUS_SIDE_MODEL) || '(main model)',
      apiUrl: clean(process.env.NVIDIA_API_URL) || '(composer default)',
      timeout: process.env.NEXUS_COMPOSER_TIMEOUT_MS || null,
      maxTokens: process.env.NVIDIA_MAX_TOKENS || null,
      temperature: process.env.NVIDIA_TEMPERATURE || null,
      topP: process.env.NVIDIA_TOP_P || null
    },
    data: {
      drugs: Object.keys(data.monographs || {}).length,
      aliases: Object.values(data.aliases || {}).reduce((sum, items) => sum + items.length, 0),
      interactions: (data.interactions || []).length,
      clinicalRules: (data.clinicalRules || []).length,
      protocols: (data.protocols || []).length,
      sources: Object.keys(data.sourcesRegistry || {}).length,
      validationWarnings: data.validationWarnings || []
    }
  });
};
