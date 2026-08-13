## Why

Chat threads can already be renamed via the backend and REST API (`updateChatThread`, `PATCH /sessions/:id/chat-threads/:threadId`), but there is no UI affordance to trigger a rename. Users cannot rename any active chat thread from the web interface today.

## What Changes

- Add inline rename support to chat thread tabs via double-click: the tab name becomes an editable `<input>`, Enter or blur commits, Escape cancels
- Surface server-side validation errors (duplicate name HTTP 400) as inline feedback on the edit input instead of silently swallowing them
- Add client-side pre-validation (empty name rejection, duplicate detection against `ChatThreadsState.threads`) for instant feedback
- Broadcast thread rename over WebSocket (`chat_thread_renamed` message) so other open browser tabs see the new name live
- Refresh summary-buffer thread selects and context-bar name after a rename
- Add `maxlength` to thread name inputs (both inline edit and create dialog) to prevent layout-breaking long names

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `chat-threads`: Add requirement that chat thread names are editable from the UI via double-click on a thread tab, with inline validation and cross-client sync

## Impact

- `packages/mimo-platform/public/js/chat-threads.js` — add dblclick handler in `updateThreadTabsUI()`, inline edit logic, improve `updateThread()` error handling, refresh summary selects on rename
- `packages/mimo-platform/public/js/chat.js` — add `chat_thread_renamed` case to WS message handler
- `packages/mimo-platform/src/api/rest/sessions/handlers.ts` — broadcast `chat_thread_renamed` after successful `updateChatThreadHandler` name change
- `packages/mimo-platform/test/chat-threads.test.ts` — test coverage for rename broadcast
- `packages/mimo-platform/public/js/chat-threads.js` — add `maxlength` to create dialog name input