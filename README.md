# Nexus Clinical Pharmacist — v4.7 Mode + Sidebar UX Fix

This version focuses on the UX logic we agreed on:

- General medical/pharmacy questions stay in **General Chat**.
- Clear interaction questions auto-switch to **Drug Interaction** and the theme changes.
- Clear patient/lab/symptom scenarios auto-switch to **Case Analysis**.
- Training/quiz prompts auto-switch to **Drug Reverse**.
- The sidebar is simplified to be closer to ChatGPT: brand, New Chat, grouped chat history, footer.
- Modes are now lightweight pills in the topbar instead of large sidebar cards.
- Export PDF is removed from the topbar for now and replaced with **New Chat**.
- Short greetings like `Hi` are handled locally and should respond fast without clinical formatting.

## Environment variables

```env
NVIDIA_API_KEY=your_key_here
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_MODEL=moonshotai/kimi-k2.6
NVIDIA_MAX_TOKENS=850
NEXUS_FAST_LOCAL_FIRST=true
NEXUS_COMPOSER_TIMEOUT_MS=25000
```

## Project structure

```txt
index.html
style.css
script.js
api/chat.js
data/
  drug_aliases.json
  drug_monographs.json
  interactions.json
  clinical_rules.json
  risk_keywords.json
```

## Routing behavior

```txt
General Chat
→ active ingredient, excipient, herb, formulation, manufacturing, pharmacology explanations, normal drug info

Drug Interaction
→ warfarin with amiodarone, ramipril + potassium, safe together, interaction/contraindication questions

Case Analysis
→ patient age/labs/symptoms/diagnosis/pregnancy/renal/liver/medication-list scenarios

Drug Reverse
→ quiz, train me, reverse scenario, interactive training prompts
```

## Deployment notes

After replacing files, redeploy on Vercel and hard-refresh the browser.
Do not open `index.html` directly from disk because `/api/chat` requires Vercel or `vercel dev`.
