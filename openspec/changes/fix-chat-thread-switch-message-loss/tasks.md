## 1. Fix Ghost DOM Node in loadChatHistory

- [x] 1.1 Clear `ChatState.streaming.messageElement` when `loadChatHistory` wipes DOM
- [x] 1.2 Clear `ChatState.streaming.thoughtElement` when `loadChatHistory` wipes DOM
- [x] 1.3 Reset `ChatState.streaming.content` to empty string
- [x] 1.4 Reset `ChatState.streaming.thoughtContent` to empty string

## 2. Guard handleStreamingState Against Detached Nodes

- [x] 2.1 Add `isConnected` check before reusing existing `messageElement` in `handleStreamingState`
- [x] 2.2 Create new streaming element if existing one is detached

## 3. Fix Pending Messages Leak Across Threads

- [x] 3.1 Clear `ChatState.pendingMessages` Set in `prepareThreadSwitch`
- [x] 3.2 Verify no other thread switch paths bypass `prepareThreadSwitch`

## 4. Persist Empty Cancellations on Server

- [x] 4.1 Modify `flushAsCancelled` in `streaming-pipeline.ts` to save empty assistant message when content is null
- [x] 4.2 Ensure empty cancelled messages display "Cancelled" indicator in UI

## 5. Testing and Verification

- [ ] 5.1 Test thread switch during active streaming - verify content is visible after return
- [ ] 5.2 Test thread switch immediately after cancelling - verify cancelled message persists
- [ ] 5.3 Test sending message then quick thread switch - verify no duplicate suppression on return
- [x] 5.4 Run frontend unit tests: `cd packages/mimo-platform && bun test`
- [x] 5.5 Run server unit tests: `cd packages/mimo-platform && bun run test.full`
