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
