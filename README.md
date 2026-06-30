# Nexus Clinical Pharmacist — v5.1 Shadow Check

Small patch on top of v5.0 Work Shelf.

## What changed

### Nexus Shadow Check
- Adds a deterministic `shadow_check` object inside the Evidence Brief.
- Case Analysis / Drug Interaction prompts now ask the AI to include **Nexus Shadow Check** when relevant.
- Shadow Check focuses on:
  - hidden risks the pharmacist/user may miss
  - missing or blind-spot data
  - urgency changers
  - pharmacist traps / unsafe assumptions
  - monitoring focus

### Frontend tool button
- Adds a **Shadow** button under assistant messages.
- If the user selects part of an answer, Shadow audits only the selected excerpt.
- If nothing is selected, Shadow audits the full answer against the latest user case.
- It submits a focused Case Analysis prompt automatically.

### Backend updates
- `lib/evidenceBrief.js`: adds `buildShadowCheck()` and includes it in `pipelineContext`.
- `api/chat.js`: passes latest user text to the Evidence Brief and returns `X-Nexus-Shadow: enabled` when relevant.
- `lib/composer.js`: instructs the model to produce a concise Shadow Check for complex clinical/interaction cases.

## Files changed in the patch

- `index.html`
- `style.css`
- `script.js`
- `api/chat.js`
- `lib/composer.js`
- `lib/evidenceBrief.js`
- `README.md`

## Manual test

1. Ask a complex case:

```txt
Patient 72 years old with CKD, ramipril, spironolactone, furosemide, diclofenac, metformin, warfarin and amiodarone. eGFR 24, K 5.9, creatinine 1.6 to 2.4, INR 4.1, reduced urine output and bruising. What are the urgent medication-related problems?
```

Expected:
- Normal case analysis.
- A section called **Nexus Shadow Check** or equivalent.
- Shadow should mention hidden renal/potassium/bleeding traps and missing data like ECG, active bleeding, urine output/volume status.

2. Click **Shadow** under the assistant answer.

Expected:
- A new focused audit response with only hidden risks, missing/blind-spot data, urgency changers, and pharmacist traps.

## Deploy

Upload these patch files over v5.0 and redeploy on Vercel.
