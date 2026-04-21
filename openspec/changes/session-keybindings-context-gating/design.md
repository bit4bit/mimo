## Context

The session page has three left-frame buffers (`chat`, `edit`, `patches`) and three right-frame buffers (`notes`, `impact`, `mcp-servers`). Tab switching is handled by `chat.js:2836-2842` → `switchFrameBuffer` → `applyFrameState` (`chat.js:624-642`), which toggles the `.active` class on `.frame-tab` elements and keeps an internal mirror in `ChatState.frames`. The DOM class is the authoritative, already-synced signal for "which buffer is the user working in."

All session shortcuts are dispatched by a single `onKeyDown` handler registered at `document` in capture phase (`session-keybindings.js:588`). Today, the handler has no notion of context. Only patch approve/decline contains an inline check:

```js
const activeTab = document.querySelector('.frame-tab[data-frame-id="left"].active');
if (activeTab && activeTab.getAttribute("data-buffer-id") === "patches") { ... }
```

## Goals / Non-Goals

**Goals:**
- Every shortcut dispatches only in the buffer it logically belongs to.
- Unrelated shortcuts fall through (no `preventDefault()`) so the browser's native behavior runs — this is what makes `Alt+Shift+Arrow` stop swallowing macOS word-selection when the user is not in the Edit buffer.
- Single, centralized helper. No duplicated `querySelector` calls across branches.

**Non-Goals:**
- Rebinding any shortcut. `DEFAULT_KEYBINDINGS` is untouched.
- Element-level focus checks (`document.activeElement.closest(...)`). Tab-level gating is sufficient for the reported bug. Element-level gating would break the existing README contract: "Session shortcuts are active even while focus is inside text inputs and editable chat content."
- Right-frame scoping. The notes-focus shortcuts remain global because they are "jump to notes" navigation commands, not notes-scoped actions.
- Changes outside `session-keybindings.js` (besides new tests).

## Decisions

### D1: Tab-level context via DOM query

**Decision:** Context is derived from `.frame-tab[data-frame-id="left"|"right"].active`, read fresh on each `keydown`.

**Alternatives considered:**
- Subscribe to `ChatState.frames` internal state — rejected: couples the handler to `chat.js` internals, and DOM is already the source of truth.
- Track last-focused element via `focusin`/`focusout` listeners — rejected: more moving parts, and the "active tab" signal already answers the question.

**Rationale:** DOM is the existing, already-synced signal. A `querySelector` per keydown is cheap. Helper is ~10 lines, no lifecycle.

### D2: Gating mapping

**Decision:** Each binding is classified as `chat`, `edit`, `patches`, or `global`. Binding fires only when `leftBufferId` matches, or unconditionally when `global`.

| Binding | Context |
|---|---|
| `newThread`, `nextThread`, `previousThread` | `chat` |
| `openFileFinder`, `closeFile`, `reloadFile`, `nextFile`, `previousFile` | `edit` |
| `toggleExpertMode`, `expertInput`, `moveFocusUp`, `moveFocusDown`, `centerFocus`, `increaseFocus`, `decreaseFocus` | `edit` (plus existing `expertState.enabled` check where present) |
| `approvePatch`, `declinePatch` | `patches` |
| `commit`, `projectNotes`, `sessionNotes`, `shortcutsHelp`, `closeModal`, `nextLeftBuffer`, `previousLeftBuffer`, `toggleRightFrame` | `global` |

**Rationale:**
- Thread nav is conceptually a chat action. User complaint was explicit.
- File finder / per-file nav assumes an open file — only meaningful in `edit`.
- Expert-mode shortcuts already have an "enabled" gate; adding an `edit`-tab gate closes the macOS word-selection bug without changing semantics when the Edit buffer *is* active.
- Cross-buffer and session-level commands stay global so users can always jump to commit, notes, or help from anywhere.

### D3: Early-return, not `handled = true`

**Decision:** When the context doesn't match, the handler's `else if` branch does nothing — `handled` stays `false`, so the existing `preventDefault()` call at `:577-580` is skipped, and the browser's default runs.

**Rationale:** This is the load-bearing piece for the macOS bug. If we called `preventDefault()` even on unmatched-context branches, we'd continue to swallow native word-selection. Letting the event propagate naturally is the fix.

### D4: Expert-mode stacked gate

**Decision:** For expert-mode shortcuts, keep the existing `expertState.enabled && state !== "processing"` check. Add a `leftBufferId === "edit"` check *in addition*.

**Rationale:** Expert mode is a persisted per-session flag. Leaving its gate intact preserves existing behavior (e.g., `Enter` opening the instruction input still requires expert mode to be on). The tab gate is purely additive and closes the cross-buffer leakage path.

## Risks / Trade-offs

- **Discoverability regression:** A user with left frame on `patches` presses `Cmd+Shift+F` expecting the file finder, nothing happens. Mitigation: `Cmd+Shift+F` as a global "open file finder anywhere" is a reasonable future shortcut, but out of scope here. Keyboard help overlay already documents the shortcuts; adding a per-binding context hint to the overlay is a follow-up.
- **Future bindings must pick a category:** Adding a new shortcut now requires deciding which bucket it belongs to. The helper makes this one line. The design docs the table explicitly so the decision is visible.
- **Edge case — no active left tab:** At page load, before `applyFrameState` runs, `leftBufferId` could be `null`. All gated shortcuts fail closed (do nothing). Global shortcuts still work. Acceptable; this window is milliseconds.
