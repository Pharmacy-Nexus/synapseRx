# Nexus Clinical Pharmacist — v4.6 UX Polish

## What changed in v4.6

- Message rail previews now appear only on hover/focus, not permanently on the active message.
- Active rail segment still shows the current position, but without a distracting floating message card.
- PDF export blank-page issue fixed by rendering the PDF report inside the renderable page area instead of far off-screen.
- PDF export now forces a white report background, waits for fonts to load, and strips suggested-question blocks from assistant content before export.
- The PDF report has cleaner callout/table styling for clinical content.

## Environment variables

```env
NVIDIA_API_KEY=your_key_here
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_MODEL=moonshotai/kimi-k2.6
NVIDIA_MAX_TOKENS=850
NEXUS_FAST_LOCAL_FIRST=true
NEXUS_COMPOSER_TIMEOUT_MS=25000
```

## Deploy

Upload all files/folders to Vercel, including:

```txt
index.html
style.css
script.js
api/chat.js
data/*
vercel.json
```

After changing environment variables, run a fresh Redeploy from Vercel.
