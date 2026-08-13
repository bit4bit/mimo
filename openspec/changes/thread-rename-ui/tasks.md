## 1. Frontend: inline edit on double-click

- [x] 1.1 Add `dblclick` event listener to each thread tab button in `updateThreadTabsUI()` that calls a new `startInlineRename(thread)` function
- [x] 1.2 Implement `startInlineRename(thread)`: replace the tab's name `<span>` with an `<input type="text">` pre-filled with current name, select all text, focus the input, apply `maxlength=60`
- [x] 1.3 Add Enter key handler on the inline input: validate, commit via `updateThread`, re-render tab on success or show inline error on failure
- [x] 1.4 Add blur handler on the inline input: if name changed, commit; otherwise cancel
- [x] 1.5 Add Escape key handler on the inline input: cancel edit, restore original tab via `updateThreadTabsUI()`
- [x] 1.6 Guard against entering edit mode when an inline edit is already active on another tab (only one edit at a time)

## 2. Frontend: client-side validation

- [x] 2.1 In the commit path, reject empty/whitespace-only name: cancel edit, restore original, no request sent
- [x] 2.2 In the commit path, detect unchanged name: no-op cancel, no request sent
- [x] 2.3 In the commit path, check duplicate against `ChatThreadsState.threads` (excluding the thread being renamed): if duplicate, show inline error on input (red border + error message), stay in edit mode, no request sent

## 3. Frontend: error surfacing from `updateThread()`

- [x] 3.1 Modify `updateThread()` in `chat-threads.js` to re-throw on error instead of silently returning `null`
- [x] 3.2 Audit existing callers of `updateThread()` (model select, mode select, brainWash checkbox) to ensure they handle the thrown error gracefully (wrap in try/catch or ignore — they currently don't check return value)
- [x] 3.3 In the inline rename commit path, catch errors from `updateThread()`, show inline error on the input (red border), and keep the input in edit mode

## 4. Frontend: secondary UI refresh on rename

- [x] 4.1 After a successful inline rename, call `updateSummaryBufferSelects()` to refresh summary-buffer dropdowns
- [x] 4.2 After a successful inline rename, call `updateThreadContextUI()` if the renamed thread is the active thread (to update the context bar name display)

## 5. Frontend: `maxlength` on create dialog

- [x] 5.1 Add `maxlength="60"` attribute to the `#new-thread-name` input in `showCreateThreadDialog()`

## 6. Backend: WebSocket broadcast on rename

- [x] 6.1 In `updateChatThreadHandler` (`handlers.ts`), after a successful `updateChatThread` call where `body.name !== undefined`, broadcast `{ type: "chat_thread_renamed", sessionId, threadId, name: updated.name }` to session WS subscribers via `broadcastToSession`
- [x] 6.2 Import `broadcastToSession` and resolve `chatSessions` from `mimoContext` in the handler (follow the pattern used in `server.ts:367`)

## 7. Frontend: WS handler for `chat_thread_renamed`

- [x] 7.1 Add `case "chat_thread_renamed"` to the WS message switch in `chat.js` calling a new `handleChatThreadRenamed(data)` function
- [x] 7.2 Implement `handleChatThreadRenamed(data)`: find the thread in `ChatThreadsState.threads` by `data.threadId`, update its `.name`, call `updateThreadTabsUI()`
- [x] 7.3 In `handleChatThreadRenamed`, if the renamed thread is the active thread, call `updateThreadContextUI()` to update the context bar
- [x] 7.4 In `handleChatThreadRenamed`, call `updateSummaryBufferSelects()` to refresh dropdowns

## 8. Tests

- [x] 8.1 Write test: double-click on a thread tab triggers inline edit mode (input appears, pre-filled with current name)
- [x] 8.2 Write test: Enter commits the new name via PATCH and updates local state
- [x] 8.3 Write test: Escape cancels edit and restores original name without sending a request
- [x] 8.4 Write test: empty name submission cancels edit without sending a request
- [x] 8.5 Write test: duplicate name (client-side check) shows inline error and stays in edit mode
- [x] 8.6 Write test: server 400 on rename shows inline error and stays in edit mode
- [x] 8.7 Write test: `chat_thread_renamed` WS message updates thread name in local state and re-renders tabs
- [x] 8.8 Write test: `chat_thread_renamed` for active thread updates the context bar name
- [x] 8.9 Write test: summary-buffer selects are rebuilt after a rename (both inline and WS paths)
- [x] 8.10 Write test: `updateChatThreadHandler` broadcasts `chat_thread_renamed` when name is changed
- [x] 8.11 Write test: `updateChatThreadHandler` does NOT broadcast when name is not in the update body (e.g. only model changed)
- [x] 8.12 Run full test suite (`bun test`) and ensure all tests pass
  - Note: suite is 1546 pass / 2 fail. The 2 failures (`edit-buffer-mention-mode.test.ts`, `impact-validation.test.ts`) are pre-existing on baseline commit `2836025^` and unrelated to this change (they touch `edit-buffer.js` / `impact/calculator.ts` only).