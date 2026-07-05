# Nexus Clinical Pharmacist — v5.9 Stable Rollback + SideAsk Safe Fix

This build intentionally rolls back the risky dedicated SideAsk route experiment and keeps the main chat on the stable `/api/chat` route.

## What changed

- Main chat uses `/api/chat` only.
- SideAsk uses the same stable `/api/chat` route with `{ sideAsk: true, stream: false, question }`.
- Removed dependency on a separate `/api/side-ask` endpoint.
- Frontend sends main chat with `stream: false` for stability; the UI still types the response after the JSON reply arrives.
- Increased default model output budget from 1600 to 2600 tokens to reduce cut-offs.
- Increased default composer timeout to 45 seconds.
- Lowered SideAsk temperature to reduce weird/random output.
- Added a SideAsk quality guard and one strict retry if the provider returns corrupted text.
- Updated cache busting to `script.js?v=5.9` and `style.css?v=5.9`.

## Required Vercel environment variables

- `NVIDIA_API_KEY` — required.
- `NVIDIA_MODEL` — optional, but recommended if you want to pin a known-good NIM model.

Optional tuning:

- `NVIDIA_MAX_TOKENS=2600`
- `NEXUS_COMPOSER_TIMEOUT_MS=45000`
- `NVIDIA_SIDEASK_MAX_TOKENS=700`
- `NVIDIA_SIDEASK_TEMPERATURE=0.12`

## Test after deploy

1. Hard refresh: Ctrl + F5.
2. Main chat: `hi`.
3. Main chat: paste a small clinical case.
4. SideAsk: `Explain CRP briefly`.
5. SideAsk should answer briefly and should not affect main chat history.

## Important

This build is meant to restore stability first. Do not re-add `/api/side-ask` until the main chat has been confirmed stable in production logs.
