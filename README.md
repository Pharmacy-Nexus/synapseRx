# Nexus Clinical Pharmacist — v5.3 Side Ask + Natural Tone Patch

This package keeps the no-auth Vercel build, but fixes the Side Ask behavior and makes assistant replies less robotic in normal chat.

## What changed in v5.3

- Rebuilt files into the correct deploy structure: `api/`, `lib/`, and `data/`.
- Polished Side Ask copy and styling so it feels like a premium scratchpad, not a rough popup.
- Side Ask now has its own generating state, so it does not depend on the main chat generation state.
- Clicking outside Side Ask closes it reliably; `Send to main input` also closes it after inserting text.
- Side Ask action buttons are disabled until there is text to use/copy/save.
- Composer prompts now ask the model to match the user language and sound natural while keeping safety rules.
- Vercel config is unchanged and still routes `/api/chat`.

---

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

## v5.2 — Side Ask + Selection Actions

This patch adds a separate Side Ask panel for quick side questions that should not affect the main chat context, mode switching, suggestions, Evidence Brief, or clinical thread.

### Added
- `Side Ask` button in the top bar.
- Floating Side Ask window with Explain / Rewrite / Check presets.
- `Use in main chat`, `Copy answer`, and `Save Quick` actions.
- Backend `sideAsk: true` path in `/api/chat.js`.

### Changed
- Removed persistent inline message action buttons (`Copy`, `Quick`, `Shelf`, `Shadow`).
- Added a contextual selection toolbar. Select text inside a message to show: Copy / Quick / Shelf / Shadow / Ask aside / Edit.
- Shadow remains disabled for Shadow Check outputs to avoid recursive auditing.

### Files changed
- `index.html`
- `style.css`
- `script.js`
- `api/chat.js`
- `lib/composer.js`
- `README.md`

## v5.2.1 — Side Ask Polish + Selection Toolbar Fix

Small patch on top of **v5.2 Side Ask**.

### Fixed
- Selection toolbar now hides properly after actions.
- Toolbar hides when clicking outside messages, scrolling, pressing Escape, or clearing selection.
- Prevented the toolbar from reappearing after clicking Copy / Quick / Shelf / Shadow / Ask aside.
- Very short selections now show only lightweight actions instead of the full toolbar.

### Improved
- Redesigned the Side Ask top-bar button as a clearer isolated assistant launcher.
- Redesigned the Side Ask panel with a cleaner premium card, status badge, examples, better spacing, and smoother animation.
- Side Ask remains isolated from the main chat context and does not affect mode, suggestions, or Evidence Brief.

### Files changed
- `index.html`
- `style.css`
- `script.js`
- `README.md`

### Manual tests
1. Select text inside an assistant message.
   - Expected: toolbar appears near selected text.
2. Click **Copy**.
   - Expected: text copies and toolbar disappears immediately.
3. Select text, then click anywhere outside the message.
   - Expected: toolbar disappears.
4. Select text, then scroll the chat.
   - Expected: toolbar disappears.
5. Open **Side Ask**.
   - Expected: polished isolated Side Ask panel opens and focuses the input.

## v5.4 — Soft Scope Guard + Natural Follow-ups

This patch makes Nexus less rigid in normal conversation.

### Fixed
- The scope guard no longer blocks ambiguous or short follow-up messages such as `why?`, `طيب البديل؟`, `ينفع؟`, or Arabic conversational follow-ups when the recent context is medical/pharmacy-related.
- Unknown drug/product names are less likely to be rejected before reaching the AI composer.
- Out-of-scope is now reserved for clearly unrelated requests instead of every weak keyword match.
- Composer prompt now explicitly tells the model to speak naturally, match Arabic/Egyptian Arabic when practical, and continue context-aware discussion.

### Files changed
- `api/chat.js`
- `lib/detector.js`
- `lib/composer.js`
- `README.md`
