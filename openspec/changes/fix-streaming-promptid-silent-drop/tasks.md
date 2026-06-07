## 1. Server: Include promptId in StreamingSnapshot

- [x] 1.1 Add `promptId` field to `StreamingSnapshot` interface in `streaming-pipeline.ts`
- [x] 1.2 Update `getStreamingSnapshot` to include `currentPromptByThread` value as `promptId` (null if absent)
- [x] 1.3 Update `handleRequestState` WebSocket handler to include `promptId` in the `streaming_state` broadcast payload

## 2. Frontend: Restore currentPromptId in handleStreamingState

- [x] 2.1 In `handleStreamingState`, set `ChatState.currentPromptId` from `data.promptId` when present
- [x] 2.2 Verify streaming events after reconnection pass the `shouldAcceptStreamingEvent` gate

## 3. Frontend: Make shouldAcceptStreamingEvent recoverable

- [x] 3.1 Add `replayRequested` flag to `ChatState`
- [x] 3.2 When `shouldAcceptStreamingEvent` returns false, log `console.warn` with event type, current promptId, and event promptId
- [x] 3.3 When `shouldAcceptStreamingEvent` returns false due to null `currentPromptId` but streaming element exists, send `request_replay` and set `replayRequested` flag
- [x] 3.4 When `shouldAcceptStreamingEvent` returns false due to mismatched `currentPromptId` and the event's promptId is valid, update `currentPromptId` to the event's promptId and accept the event
- [x] 3.5 Clear `replayRequested` flag in `loadChatHistory`

## 4. Frontend: Guard flushPendingPromptCompletion

- [x] 4.1 In `handlePromptReceived`, only call `flushPendingPromptCompletion` if the pending completion's `promptId` matches `ChatState.currentPromptId` or both are null

## 5. Testing

- [x] 5.1 Test server: `getStreamingSnapshot` returns `promptId` when thread has active prompt
- [x] 5.2 Test server: `getStreamingSnapshot` returns null `promptId` when no active prompt
- [x] 5.3 Test frontend: `handleStreamingState` restores `currentPromptId` from `data.promptId`
- [x] 5.4 Test frontend: rejected streaming events trigger `console.warn`
- [x] 5.5 Test frontend: null `currentPromptId` with active streaming triggers `request_replay`
- [x] 5.6 Test frontend: mismatched `promptId` with valid event promptId updates `currentPromptId`
- [x] 5.7 Run server tests: `cd packages/mimo-platform && bun test`
- [x] 5.8 Run full server suite: `cd packages/mimo-platform && bun run test.full`