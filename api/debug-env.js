module.exports = async (req, res) => {
  res.status(200).json({
    build: "atom-debug-1",
    hasNvidiaKey: Boolean(process.env.NVIDIA_API_KEY),
    model: process.env.NVIDIA_MODEL || null,
    sideModel: process.env.NEXUS_SIDE_MODEL || null,
    apiUrlSet: Boolean(process.env.NVIDIA_API_URL),
    timeout: process.env.NEXUS_COMPOSER_TIMEOUT_MS || null,
    maxTokens: process.env.NVIDIA_MAX_TOKENS || null
  });
};
