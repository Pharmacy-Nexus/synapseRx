// api/test-nvidia.js
module.exports = async (req, res) => {
  try {
    const response = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "google/gemma-4-31b-it",
          messages: [
            { role: "user", content: "Reply with exactly: Connection working" }
          ],
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 50,
          stream: false
        })
      }
    );

    const raw = await response.text();

    res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      status: response.status,
      model: "google/gemma-4-31b-it",
      response: raw.slice(0, 4000)
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
