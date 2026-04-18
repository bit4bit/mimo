## Why

The session page already supports multi-thread chat, commit flow, and split notes buffers, but navigation is mouse-driven. Power users repeatedly switch threads, open commit, and jump into notes, which creates avoidable friction.

This must work in real browsers (Chrome, Firefox, Safari, Edge) without breaking native text editing behavior.

## What Changes

- Add a browser-safe keyboard profile for the session page.
- Support shortcuts for:
  - creating a new thread
  - moving between threads
  - opening commit dialog
  - focusing Project Notes input
  - focusing Session Notes input
- Add a keyboard shortcuts help overlay.
- Add auto-help behavior (first visit and failed shortcut attempts).
- Ensure shortcuts are ignored while users type in text fields (except help).

## Capabilities

### New Capabilities

- `session-keybindings`: Keyboard-driven navigation and actions for session page buffers and dialogs.

### Modified Capabilities

- `frame-buffers`: Adds keyboard-based access paths to Notes buffer inputs.

## Impact

- `packages/mimo-platform/public/js/chat.js`
- `packages/mimo-platform/public/js/chat-threads.js`
- `packages/mimo-platform/public/js/commit.js`
- `packages/mimo-platform/public/js/notes.js`
- `packages/mimo-platform/public/js/session-keybindings.js` (new)
- `packages/mimo-platform/src/components/Layout.tsx`
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`
- `packages/mimo-platform/test/*` (integration behavior tests)
