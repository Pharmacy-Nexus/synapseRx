# Nexus Clinical Pharmacist — v5.1.1 Sidebar + Shadow Hotfix

Small patch on top of **v5.1 Shadow Check**.

## Fixed

- Prevents Shadow Check from auditing another Shadow Check by default.
- Shadow button is hidden on Shadow Check responses.
- Shadow action now shows a clean short user message instead of dumping the full internal prompt in chat.
- Shadow prompt now uses the latest real clinical user case, not the previous Shadow prompt.
- Suggested next questions for Shadow Check are now Shadow-related instead of unrelated hyperkalemia/AKI defaults.
- Quick Access recall is stricter so unrelated saved notes like DOACs/lamotrigine do not appear under weakly related answers.
- Sidebar is organized into tabs: **Chats / Quick / Shelf** instead of stacking everything at once.

## Files changed

- `index.html`
- `style.css`
- `script.js`
- `README.md`

## Manual tests

1. Ask: `Check a medication interaction and explain the mechanism.`
2. Click **Shadow** under the assistant answer.
   - Expected: user bubble says only `Run Nexus Shadow Check`, not the full prompt.
3. The Shadow response should not show another **Shadow** button.
4. Sidebar should show tabs: **Chats / Quick / Shelf**.
5. Quick Access notes should only appear when there is a strong title/tag/content match.
