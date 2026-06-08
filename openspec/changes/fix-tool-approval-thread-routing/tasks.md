## 1. Platform — forward chatThreadId in permission_request broadcast

- [x] 1.1 In `packages/mimo-platform/src/domain/agents/message-router.ts` `handlePermissionRequest`: extract `chatThreadId` from `data` and include it in the broadcast message sent to chat subscribers
- [x] 1.2 In `packages/mimo-platform/src/domain/agents/message-router.ts` `handlePermissionRequest`: include `chatThreadId` in `pendingPermissions` map value so it is available for later reference

## 2. Frontend — thread-scoped filtering for permission_request and permission_resolved

- [x] 2.1 In `packages/mimo-platform/public/js/chat.js` `permission_request` case: add `activeThreadId` guard — if `data.chatThreadId` exists and differs from `activeThreadId`, skip rendering the approval card and instead trigger notification logic
- [x] 2.2 In `packages/mimo-platform/public/js/chat.js` `permission_resolved` case: add `activeThreadId` guard — if `data.chatThreadId` exists and differs from `activeThreadId`, skip silently (card is in another thread's view)

## 3. Frontend — browser notification for non-active thread tool approval

- [x] 3.1 Add `showThreadAttentionNotification(chatThreadId, toolCallTitle)` helper in `chat.js` that requests browser notification permission if needed, then shows a notification with thread info and tool title
- [x] 3.2 Add notification click handler that calls `window.focus()` and dispatches a thread-switch action for the `chatThreadId` from the notification data
- [x] 3.3 Guard the notification: only fire if the session's `browserNotificationsEnabled` is `true` — read from session state already available to the frontend
- [x] 3.4 If browser notification permission is not granted, silently skip without error — the approval card still renders when user manually switches to the thread

## 4. Tests

- [x] 4.1 Integration test: platform broadcasts `permission_request` with `chatThreadId` to chat subscribers
- [x] 4.2 Integration test: chat sends `permission_response` for a thread-scoped request; platform routes to agent correctly
- [x] 4.3 Frontend test: `permission_request` with non-active `chatThreadId` does not render approval card in the active thread
- [x] 4.4 Frontend test: `permission_request` with non-active `chatThreadId` triggers browser notification when `browserNotificationsEnabled` is true
- [x] 4.5 Frontend test: notification click handler invokes thread-switch and window focus