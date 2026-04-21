## Why

Session page keyboard shortcuts are currently registered at `document` level in capture phase with no notion of which buffer the user is interacting with. As a result, shortcuts fire across buffer boundaries:

- `Mod+Shift+ArrowLeft/Right` (thread navigation) triggers while the user is working in the Edit or Patches buffer, unexpectedly switching chat threads.
- Edit-buffer-specific shortcuts (file finder, close/reload file, next/previous file, expert-mode focus guide move/resize) trigger when the Edit buffer is not the active left-frame tab.
- Expert-mode shortcuts are gated only on `expertState.enabled` — a mode flag that persists in localStorage — not on "the Edit buffer is the active surface." On macOS, this causes a concrete bug: `Alt+Shift+ArrowLeft/Right` is meant to resize the expert-mode focus guide, but macOS reserves `Option+Shift+Arrow` as the native word-selection gesture. When left frame is showing a non-Edit buffer but expert mode is still enabled, nothing in the handler tells it to step aside; it calls `preventDefault()` anyway, and the user loses both behaviors.

Only patch approve/decline has an ad-hoc context check inline (`session-keybindings.js:549-552`, `:563-566`). The rest of the handler is context-blind.

## What Changes

- Introduce `getActiveBufferContext()` in `session-keybindings.js` returning `{ leftBufferId, rightBufferId }` from `.frame-tab[data-frame-id=...].active`.
- Gate every existing shortcut handler on the correct active left-frame buffer: thread actions on `chat`; file-finder and per-file shortcuts and all expert-mode shortcuts on `edit`; approve/decline on `patches`. Global shortcuts (commit, notes focus, help, close modal, toggle right frame, cross-buffer nav) remain ungated.
- Consolidate the existing inline patch check into the helper.
- **No changes to key bindings.** No new shortcuts. No changes to `docs/KEYBINDINGS.md`. Expert-mode's existing `expertState.enabled` check stays as an additional gate stacked on top of `leftBufferId === "edit"`.

## Capabilities

### Modified Capabilities

- `session-keybindings` — existing "Thread keyboard actions", "Commit and notes keyboard actions", and expert-mode-related requirements gain a "WHEN left-frame active buffer is X" precondition. A new "Context-aware dispatch" requirement is added describing the helper and the buffer → shortcut mapping.

## Impact

- `packages/mimo-platform/public/js/session-keybindings.js` — add `getActiveBufferContext()` helper, gate each `else if` branch.
- `packages/mimo-platform/test/` — add integration behavior tests covering one representative gating case per category (chat / edit / patches / global).
