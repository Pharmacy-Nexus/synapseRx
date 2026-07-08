# Atom — v5.13 Rebrand Patch

Brand/UI-only patch on top of v5.12.

## Changed

- Rebranded visible product name from Nexus to Atom.
- Updated subtitle to **AI Assistant for Pharmacists**.
- Replaced logo text `Nx` with `At`.
- Updated font to **Space Grotesk + IBM Plex Sans Arabic**.
- Updated primary colors to blue/cyan/violet Atom identity.
- Updated user-facing prompts from clinical-pharmacist-only wording to broader pharmacist assistant wording.
- Kept internal `NEXUS_*` environment variables and localStorage keys unchanged to avoid breaking deployments/history.

---

# Atom — v5.12 Context Suggestions Repair

Small safe patch on top of v5.11.

## Fixed

- Old Suggested next questions are removed when the user sends the next message, so they do not stay floating above the composer.
- Fallback suggestions are now topic-specific and no longer default to static generic prompts.
- Short follow-ups are treated as referring to the latest clinical case/topic unless the user clearly changes topic.
- Composer prompt now tells the model to keep follow-up questions specific to the current case.
- Cache busting updated to `script.js?v=5.12` and `style.css?v=5.12`.

---

# Atom — v5.10 Stable UI Repair

This build repairs the broken main chat behavior introduced after Side Ask patches.

## Fixed
- Main chat no longer crashes after the API returns an assistant answer.
- Fixed `ensureRelatedQuestions()` using an undefined `content` variable instead of the function argument `text`.
- Hardened `finalizeAssistantNode()` so suggestions/Quick Recall/Markdown rendering cannot break the assistant response.
- Kept Side Ask on the same stable `/api/chat` route with `sideAsk: true`.
- Cache-busted `script.js` and `style.css` to v5.10.

## Test order
1. Hard refresh with Ctrl+F5.
2. Main chat: `hi`
3. Main chat: send a clinical question.
4. Side Ask: `Explain CRP briefly.`

## Notes
Do not redeploy v5.7, v5.8, or v5.9. This is a repair build based on the rollback plus the critical UI crash fix.


## v5.11 — Streaming + Timeout Repair

Stability patch after main chat returned only a timeout fallback.

### Fixed
- Main chat now sends `stream: true` again so the API can start returning tokens instead of waiting for the full AI answer.
- Composer timeout now has a safe floor (45s) even if Vercel env accidentally sets `NEXUS_COMPOSER_TIMEOUT_MS=25000`.
- Token budget is dynamic: shorter questions request shorter answers, long cases still get enough room.
- Clinical rule matching now uses safer term matching and avoids false positives like `blood pressure` triggering warfarin bleeding rules.
- Added a local emergency rule for suspected medicine-induced anaphylaxis so timeout fallback is clinically relevant for the penicillin test case.

### Deployment note
If Vercel has `NEXUS_COMPOSER_TIMEOUT_MS=25000`, remove it or set it to `50000`. This build will still floor it to 45s, but cleaning the env avoids confusion.


## v5.14 — Suggestions + clinical-rule cleanup

This patch keeps the v5.13 Atom rebrand and avoids API/routing changes.

### Fixed
- Suggested chips now render only under the latest assistant response.
- Old chips are hidden when the user continues the chat.
- Model-generated canned “Suggested next questions” are stripped/filtered more aggressively.
- Bleeding/INR suggestions are blocked unless the active case actually includes anticoagulation or active bleeding context.
- Composer prompt now tells the model not to generate Suggested/Related questions; the UI handles them.

### Added local clinical data
- SGLT2 inhibitor aliases/monographs and sick-day acute illness rule.
- Colchicine + clarithromycin high-risk interaction rule.
- Clarithromycin + atorvastatin myopathy/rhabdomyolysis risk.
- ARB + NSAID + diuretic triple-whammy rule including losartan + ibuprofen + HCTZ.

### Files changed
- `script.js`
- `lib/composer.js`
- `lib/evidenceBrief.js`
- `data/drug_aliases.json`
- `data/drug_monographs.json`
- `data/clinical_rules.json`
- `data/interactions.json`
- `README.md`


## v5.15 — Fact Lock + Source Cleanup Patch

Patch files only release.

### Fixed
- Added Case Fact Lock instructions to reduce invented/changed case values, timelines, doses, and lab numbers.
- Tightened clinical-rule triggering so broad words like renal/blood do not surface unrelated ACEI/NSAID/warfarin sources.
- Added local rules for serotonin syndrome, QT prolongation, SSRI/SNRI/thiazide hyponatremia, and DOAC fall/occult bleeding.
- Added key monographs/aliases/interactions for sertraline, duloxetine, tramadol, amitriptyline, ondansetron, and apixaban.
- Quick Access recall is now hidden for high-risk clinical answers unless explicitly allowed, preventing unrelated saved notes from appearing under emergency cases.
- Added one silent non-stream retry if the provider returns empty text.
- Updated cache busting to `script.js?v=5.15` and `style.css?v=5.15`.

### Modified files
- `index.html`
- `script.js`
- `api/chat.js`
- `lib/composer.js`
- `lib/engines.js`
- `lib/evidenceBrief.js`
- `data/clinical_rules.json`
- `data/drug_aliases.json`
- `data/drug_monographs.json`
- `data/interactions.json`
- `README.md`
