## Context

The session UI is composed from multiple browser scripts (`chat.js`, `chat-threads.js`, `commit.js`, `notes.js`) and frame/tab state in the session page. Today, interactions are click-first and there is no unified keyboard dispatcher.

The new behavior must be browser-compatible and avoid collisions with common browser shortcuts.

## Goals / Non-Goals

**Goals:**
- Provide one consistent, browser-safe key profile for session actions.
- Keep behavior reliable across Chrome, Firefox, Safari, and Edge.
- Keep native typing behavior intact in text inputs and textareas.
- Provide discoverable help, including automatic help hints.

**Non-Goals:**
- Global app-wide shortcut system outside session page.
- User-custom keymap editor in this change.
- Replacing existing click handlers; keyboard should reuse existing actions.

## Decisions

### D1: Default browser-safe key profile

**Decision**: Use `Mod+Shift` shortcuts for core actions (`Mod = Meta on macOS, Ctrl on Windows/Linux):
- `Mod+Shift+ArrowRight` -> next thread
- `Mod+Shift+ArrowLeft` -> previous thread
- `Mod+Shift+N` -> create new thread
- `Mod+Shift+M` -> open commit dialog
- `Mod+Shift+,` -> focus Project Notes
- `Mod+Shift+.` -> focus Session Notes
- `Mod+Shift+/` -> open shortcuts help

**Alternatives considered**:
- Emacs-like chords (`C-x`, `C-c`) in browser context.
- Heavy `Ctrl/Cmd` combinations that conflict with browser defaults.

**Rationale**: Matches the requested Meta+Shift style while keeping one cross-platform profile through `Mod` abstraction.

### D2: Central dispatcher module

**Decision**: Add `session-keybindings.js` as a thin controller that listens for `keydown`, resolves action, and triggers existing UI actions.

**Rationale**: Keeps key logic in one place and avoids duplicating behavior across existing scripts.

### D3: Safe execution boundaries

**Decision**:
- Ignore shortcuts while focus is in `input`, `textarea`, `select`, or `[contenteditable]`.
- Exception: `Mod+Shift+/` help can always open.
- Call `preventDefault()` only when a known shortcut is handled.

**Rationale**: Preserves native typing/editing behavior and avoids unexpected browser interference.

### D4: Auto-help behavior

**Decision**:
- Show help overlay automatically on first session-page visit.
- Show a compact hint after an unrecognized `Mod+Shift+<key>` attempt in session context.
- Persist dismissal preference in `localStorage`.

**Rationale**: Makes shortcuts discoverable without forcing repeated interruptions.

### D5: Browser compatibility strategy

**Decision**:
- Match on `event.key` with `event.code` fallback.
- Keep shortcuts limited to keys with stable browser behavior.
- Define explicit no-conflict policy in spec acceptance criteria.

**Rationale**: Keyboard layouts and browser implementations vary; dual matching improves consistency.

## Risks / Trade-offs

- Some environments may reserve function keys at OS/browser level. Mitigation: keep click UI fully functional and provide help button fallback.
- More keyboard logic increases client complexity. Mitigation: isolate into one small module and verify with integration tests.
