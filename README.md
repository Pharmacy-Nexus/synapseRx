# Nexus Clinical Pharmacist — v4.8.4 Audit Fix

This is the hard no-auth build. It opens the chat workspace directly and stores chats in `localStorage` for local/demo use.

## What changed in v4.8.4

- Added API body-size limit: `NEXUS_MAX_BODY_BYTES` defaults to 1 MB.
- Added CORS allowlist support: `NEXUS_ALLOWED_ORIGINS`.
- API errors are now generic to the client; provider details are logged server-side only.
- Added stronger prompt-injection wording: user/file content cannot override evidence or safety rules.
- Limited model conversation context sent to the provider: `NEXUS_MAX_CONTEXT_MESSAGES` defaults to 12.
- Sidebar close now works on desktop and mobile.
- Vague human/person questions now ask for clarification instead of returning out-of-scope.
- File upload is limited to readable text formats only: `.txt`, `.md`, `.csv`, `.json`.

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
NEXUS_COMPOSER_TIMEOUT_MS=25000
NEXUS_MAX_CONTEXT_MESSAGES=12
NEXUS_MAX_BODY_BYTES=1048576
```

Recommended security variable:

```env
NEXUS_ALLOWED_ORIGINS=https://your-site.vercel.app
```

You can also set this if your app has a custom public URL:

```env
NEXUS_PUBLIC_APP_URL=https://your-domain.com
```

## If the page still shows old behavior

Open:

```txt
https://your-site.vercel.app/?reset=1
```

Then hard refresh / clear site data. This build cache-busts `style.css` and `script.js` with `?v=4.8.4`.

## Manual test checklist

- `Hi` should reply locally with no AI call.
- `ايه الفرق بين active ingredient و excipient؟` should stay General Chat.
- `warfarin with amiodarone?` should auto-switch to Drug Interaction.
- `Patient 65 years old, eGFR 28, taking metformin. Is it safe?` should auto-switch to Case Analysis.
- `معايا شخص بيتعب ومش عارف أعمل إيه` should ask clarifying emergency/context questions, not say out of scope.
- Sidebar × should collapse the sidebar on desktop; hamburger should bring it back.
