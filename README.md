# Nexus ChatGPT Style v2

## Important
GitHub Pages cannot run `/api/chat.js`. If you use GitHub Pages for the frontend, deploy this project to Vercel too and set `API_ENDPOINT` in `script.js` to your Vercel URL:

```js
const API_ENDPOINT = "https://your-vercel-app.vercel.app/api/chat";
```

If frontend and API are both on Vercel, keep:

```js
const API_ENDPOINT = window.NEXUS_API_ENDPOINT || "/api/chat";
```

## Vercel Environment Variables

```env
NVIDIA_API_KEY=your_new_key
NVIDIA_MODEL=moonshotai/kimi-k2.6
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
```
