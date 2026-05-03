## 1. Add Prompt-in-Flight Tracking to Streaming Pipeline

- [x] 1.1 Add `promptInFlight` Set to `ChatStreamingPipeline` class
- [x] 1.2 Implement `setPromptInFlight(sessionId, threadId)` method
- [x] 1.3 Implement `clearPromptInFlight(sessionId, threadId)` method
- [x] 1.4 Implement `isPromptInFlight(sessionId, threadId)` method
- [x] 1.5 Clear `promptInFlight` in `clearBuffers()` method

## 2. Hook Prompt Lifecycle in Message Router

- [x] 2.1 Call `pipeline.setPromptInFlight()` in `handlePromptReceived`
- [x] 2.2 Call `pipeline.clearPromptInFlight()` in `handleUsageUpdate`
- [x] 2.3 Call `pipeline.clearPromptInFlight()` in `handleErrorResponse`
- [x] 2.4 Add `clearPromptInFlight` to agent disconnect handler (if exists)

## 3. Update WebSocket request_state Handler

- [x] 3.1 Check `pipeline.isPromptInFlight()` in addition to content buffers
- [x] 3.2 Send `streaming_state` when `isPromptInFlight` is true even with empty content

## 4. Update Frontend handleStreamingState

- [x] 4.1 Insert streaming message element even when `messageContent` is empty
- [x] 4.2 Ensure "Received, processing..." indicator is visible for empty reconstructed state
- [x] 4.3 Verify `isConnected` guard still works for detached nodes

## 5. Testing and Verification

- [ ] 5.1 Test: Send message → switch thread → return → verify "Received, processing..." visible
- [ ] 5.2 Test: Reload browser during prompt processing → verify indicator survives
- [ ] 5.3 Test: Verify indicator disappears after `usage_update` arrives
- [ ] 5.4 Test: Verify indicator disappears after `error_response` arrives
- [x] 5.5 Run streaming pipeline tests: `cd packages/mimo-platform && bun test`
- [x] 5.6 Add unit test for `promptInFlight` Set methods
- [x] 5.7 Add unit test for `request_state` with in-flight prompt
