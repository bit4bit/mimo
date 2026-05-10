## Why

Pressing the "new chat thread" keybinding multiple times in the session details page creates multiple overlapping modal dialogs. The expected behavior is toggle: press once to open, press again to close.

## What Changes

- `openCreateThreadDialog()` in `session-keybindings.js` gains toggle logic — if the dialog is already open, it closes it instead of opening another
- `showCreateThreadDialog()` in `chat-threads.js` gains a defensive guard — prevents duplicate dialogs from any trigger path (button click or keybinding)

## Capabilities

### New Capabilities

- `new-thread-dialog-toggle`: The new-thread keybinding toggles the create-thread dialog open/closed, consistent with how other dialogs (commit, file finder) behave

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- `packages/mimo-platform/public/js/session-keybindings.js` — `openCreateThreadDialog()` function
- `packages/mimo-platform/public/js/chat-threads.js` — `showCreateThreadDialog()` function
- No API changes, no server-side changes, no new dependencies
