# Nexus Clinical Pharmacist — v5.12 Context Suggestions Repair

Small safe patch on top of v5.11.

## Fixed

- Old Suggested next questions are removed when the user sends the next message, so they do not stay floating above the composer.
- Fallback suggestions are now topic-specific and no longer default to static generic prompts.
- Short follow-ups are treated as referring to the latest clinical case/topic unless the user clearly changes topic.
- Composer prompt now tells the model to keep follow-up questions specific to the current case.
- Cache busting updated to `script.js?v=5.12` and `style.css?v=5.12`.

---

# Nexus Clinical Pharmacist — v5.10 Stable UI Repair

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
