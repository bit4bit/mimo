## Why

Tool approval cards appear in the wrong chat thread. When Thread 1 requests approval and the user is viewing Thread 2, the approval card renders in Thread 2 instead. This happens because (1) the platform drops `chatThreadId` when broadcasting `permission_request` to chat clients, and (2) the frontend does not filter `permission_request` messages by thread. Additionally, there is no signal to the user when a non-active thread needs attention — the approval card silently appears in the wrong thread or gets missed entirely.

## What Changes

- Pass through `chatThreadId` in the platform's `permission_request` broadcast to chat clients
- Frontend filters `permission_request` and `permission_resolved` by `activeThreadId`, matching the existing pattern used by `streaming_state` and other message types
- When a `permission_request` arrives for a non-active thread, fire a browser notification alerting the user that a thread needs attention, with a click action that switches to that thread

## Capabilities

### New Capabilities

- `thread-attention-notification`: Browser notification when a non-active chat thread requires user action (e.g., tool approval)

### Modified Capabilities

- `tool-approval`: Permission requests are now scoped to the originating chat thread; cards only render in the correct thread
- `session-browser-notifications`: Notification trigger expands beyond `prompt_completed` + `document.hidden` to also cover `permission_request` when the user is viewing a different thread in the same tab

## Impact

- `packages/mimo-platform/src/domain/agents/message-router.ts` — forward `chatThreadId` in `permission_request` broadcast
- `packages/mimo-platform/public/js/chat.js` — thread-scoped filtering for `permission_request`/`permission_resolved`, notification logic for non-active thread approval requests