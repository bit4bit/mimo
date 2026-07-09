## 1. Per-switch reconstruction state in ChatState

- [x] 1.1 Add `historyLoaded` (boolean, default `false`) and `pendingStreamingSnapshot` (object|null, default `null`) fields to `ChatState` in `chat.js`
- [x] 1.2 In `prepareThreadSwitch` (`chat.js:2341`), reset `historyLoaded = false` and `pendingStreamingSnapshot = null`
- [x] 1.3 Clear any active safety timeout timer reference in `prepareThreadSwitch` to avoid leaks across switches

## 2. Buffer streaming_state when history hasn't loaded

- [x] 2.1 In `handleStreamingState` (`chat.js:2412`), add a `chatThreadId === activeThreadId` guard before any processing; drop non-active-thread replies
- [x] 2.2 In `handleStreamingState`, if `historyLoaded === false`, store `data` into `pendingStreamingSnapshot`, start the safety timeout timer, and return without building the bubble
- [x] 2.3 In `handleStreamingState`, if `historyLoaded === true`, apply normally (existing behavior unchanged)

## 3. Apply buffered snapshot after history loads

- [x] 3.1 In `loadChatHistory` (`chat.js:3510`), set `historyLoaded = true` after rendering finalized messages
- [x] 3.2 After setting `historyLoaded`, if `pendingStreamingSnapshot` is non-null, call `handleStreamingState(pendingStreamingSnapshot)`, then clear `pendingStreamingSnapshot` and clear the safety timeout timer
- [x] 3.3 Ensure the existing end-of-`loadChatHistory` editable-bubble heuristic (`chat.js:3637`) still works when a snapshot is applied (the snapshot calls `removeEditableBubble`, so no bubble is inserted)

## 4. Safety timeout

- [x] 4.1 Add a `streamingSnapshotTimer` reference to `ChatState`
- [x] 4.2 When buffering a snapshot (task 2.2), start a ~2000ms timer that applies `pendingStreamingSnapshot` and clears it if `historyLoaded` is still `false` when it fires
- [x] 4.3 Clear the timer wherever the snapshot is applied normally (tasks 3.2) and in `prepareThreadSwitch` (task 1.3)

## 5. Recovery path requests request_state

- [x] 5.1 In `shouldAcceptStreamingEvent` (`chat.js:1500-1562`), change the null-promptId recovery branch to send `{type: "request_state", chatThreadId: activeThreadId}` instead of `request_replay`
- [x] 5.2 Rename/repurpose the `replayRequested` flag to `stateRequested` (or keep the name, just change what it gates) so duplicate recovery requests are prevented
- [x] 5.3 Clear `stateRequested` when `handleStreamingState` successfully applies a snapshot (both the buffered-then-applied path and the immediate path)
- [x] 5.4 Verify the `loadChatHistory` clear of `replayRequested` (`chat.js:3520`) is updated to clear `stateRequested` instead (or in addition) so the flag doesn't stick

## 6. Tests

- [x] 6.1 Unit test: `streaming_state` arriving before `history` is buffered and applied after `loadChatHistory` completes (verify bubble built once, partial visible)
- [x] 6.2 Unit test: `history` arriving before `streaming_state` applies snapshot immediately (existing path, verify no regression)
- [x] 6.3 Unit test: `streaming_state` with mismatched `chatThreadId` is dropped without buffering
- [x] 6.4 Unit test: safety timeout applies buffered snapshot when `history` never arrives within ~2s
- [x] 6.5 Unit test: `prepareThreadSwitch` resets `historyLoaded`, `pendingStreamingSnapshot`, and clears the safety timer
- [x] 6.6 Unit test: recovery branch sends `request_state` (not `request_replay`) when `currentPromptId` is null
- [x] 6.7 Unit test: `stateRequested` flag prevents duplicate `request_state` sends and is cleared when `streaming_state` is applied
- [ ] 6.8 Manual test: switch to a thread actively streaming and confirm the partial response renders immediately without waiting for the next live chunk
- [ ] 6.9 Manual test: switch rapidly between two streaming threads and confirm no cross-thread bleed or stale bubbles