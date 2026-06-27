# Nexus Clinical Pharmacist — v4.8.3 Hard No-Auth

This build removes the login gate completely. It opens the chat workspace directly and stores chats in localStorage.

## Deploy checklist

Upload the whole folder, including:

```txt
index.html
style.css
script.js
api/chat.js
lib/
data/
vercel.json
```

Vercel environment variables:

```env
NVIDIA_API_KEY=your_key_here
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_MODEL=moonshotai/kimi-k2.6
NVIDIA_MAX_TOKENS=850
NEXUS_FAST_LOCAL_FIRST=true
NEXUS_COMPOSER_TIMEOUT_MS=25000
```

## If the page still shows old behavior

Open:

```txt
https://your-site.vercel.app/?reset=1
```

Then hard refresh / clear site data. This build cache-busts `style.css` and `script.js` with `?v=4.8.3`.

## Test

- `Hi` should reply locally with no AI call.
- `warfarin with amiodarone?` should auto-switch to Drug Interaction.
- `Patient 65 years old, eGFR 28, taking metformin. Is it safe?` should auto-switch to Case Analysis.
