## Why

The session page currently keeps the right frame visible at all times. When users want to focus on chat or file work in the left frame, the fixed split can feel cramped and requires extra pointer movement.

Users need a fast way to collapse and restore the right frame from both mouse and keyboard, including the requested `Alt+Shift+Control+F` shortcut.

## What Changes

- Add a right-frame collapse/expand toggle button on the session page.
- Add a default keyboard action: `Alt+Shift+Control+F` to toggle right-frame collapse.
- Persist right-frame collapsed state per session alongside existing frame state.
- Preserve active right-frame buffer selection while collapsed so restore returns to the same buffer.
- Show the new shortcut in the session shortcuts bar and allow config override via `sessionKeybindings`.

## Capabilities

### Modified Capabilities

- `frame-buffers`: Add collapsible right frame behavior and persisted collapse state.
- `session-keybindings`: Add right-frame collapse toggle action and default key mapping.

## Impact

- `packages/mimo-platform/src/sessions/frame-state.ts`
- `packages/mimo-platform/src/sessions/routes.tsx`
- `packages/mimo-platform/public/js/chat.js`
- `packages/mimo-platform/public/js/session-keybindings.js`
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`
- `packages/mimo-platform/src/components/Frame.tsx`
- `packages/mimo-platform/src/config/service.ts`
- `packages/mimo-platform/src/config/validator.ts`
- `packages/mimo-platform/test/frame-buffers.test.ts`
