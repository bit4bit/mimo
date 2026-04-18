## Context

The session page renders two side-by-side frames, with tab switching and frame-state persistence already handled through `chat.js` and `/sessions/:id/frame-state`.

Current persisted state tracks only active buffer IDs. There is no notion of frame visibility/collapse.

## Goals / Non-Goals

**Goals:**
- Allow users to collapse and restore the right frame from a visible button.
- Support the requested default keybinding `Alt+Shift+Control+F`.
- Persist collapsed state per session and restore it on page load.
- Keep existing buffer switching behavior unchanged.

**Non-Goals:**
- Collapsing the left frame.
- Adding arbitrary frame resizing in this change.
- Introducing a global keybinding system outside the session page.

## Decisions

### D1: Extend persisted frame state with `rightFrame.isCollapsed`

**Decision**: Add `rightFrame.isCollapsed: boolean` to `FrameState`, defaulting to `false`.

**Rationale**: Collapse state is session-specific UI context and belongs with existing persisted frame state.

**Compatibility**:
- Missing `isCollapsed` values normalize to `false`.
- Existing `POST /frame-state` payloads that only update `activeBufferId` remain valid.

### D2: Single toggle behavior for both button and keyboard

**Decision**: Implement one toggle path in session scripts and call it from:
- right-frame toggle button click
- `toggleRightFrame` keybinding action

**Rationale**: One behavior path reduces drift between mouse and keyboard interactions.

### D3: Layout model

**Decision**:
- Collapsed state adds a container class (for example: `right-frame-collapsed`) that hides right-frame content and expands left frame.
- A compact restore control remains visible so users can reopen without keyboard.

**Rationale**: Preserves discoverability and avoids trapping users in hidden state.

### D4: Keybinding profile and configuration

**Decision**:
- Add `toggleRightFrame` to session keybinding defaults with value `Alt+Shift+Control+F`.
- Make it configurable via `sessionKeybindings.toggleRightFrame`.

**Rationale**: Matches requested shortcut while keeping the existing config-driven keybinding architecture.

### D5: Focus and accessibility

**Decision**:
- Toggle controls include accessible labels and `aria-expanded` state.
- If collapse is triggered while focus is inside right frame, move focus to a stable left-frame target.

**Rationale**: Prevents focus loss and keeps keyboard navigation predictable.

## Risks / Trade-offs

- The requested chord can conflict with OS/window-manager shortcuts in some environments. Mitigation: keep button path and configurable override.
- Persisting collapsed state may surprise users when reopening a session. Mitigation: always show visible restore control and clear shortcut hint.
