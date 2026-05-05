## 1. mimo-agent: Emit prompt_completed

- [x] 1.1 Add `onPromptCompleted` callback to `AcpClientCallbacks` interface in `src/acp/client.ts`
- [x] 1.2 Emit `prompt_completed` from `AcpClient.prompt()` after the promise resolves (both success and error paths)
- [x] 1.3 Wire `onPromptCompleted` in `MimoAgent.buildAcpCallbacks()` to send `{ type: 'prompt_completed', sessionId, chatThreadId }` via WebSocket

## 2. mimo-platform: Handle prompt_completed in streaming pipeline

- [x] 2.1 Add `handlePromptCompleted(sessionId, threadId, session)` method to `ChatStreamingPipeline` that builds message, calls `saveMessage`, clears buffers
- [x] 2.2 Modify `handleUsageUpdate` to broadcast metadata but NOT call `buildAndClearAssistantContent` or clear buffers
- [x] 2.3 Move duration calculation from `handleUsageUpdate` to `handlePromptCompleted`
- [x] 2.4 Add `prompt_completed` case to `AgentMessageRouter.handle()` that calls `pipeline.handlePromptCompleted()`

## 3. mimo-platform: Forward prompt_completed to UI

- [x] 3.1 Add `prompt_completed` broadcast in `AgentMessageRouter` (similar to `prompt_received`)
- [x] 3.2 Handle `prompt_completed` in `handleWebSocketMessage` in `chat.js`
- [x] 3.3 Call `finalizeMessageStream()` on `prompt_completed` instead of on `usage_update`
- [x] 3.4 Ensure `usage_update` still updates usage display without finalizing

## 4. Backward compatibility

- [x] 4.1 Ensure single-phase providers (Opencode) still work: mimo-agent emits `prompt_completed` immediately after `usage_update` for providers that don't do multi-phase
- [x] 4.2 Add fallback: if no `prompt_completed` arrives within a grace period after `usage_update`, auto-finalize (prevents stuck boxes for old agents)

## 5. Testing

- [x] 5.1 Add unit test: `ChatStreamingPipeline` does not clear buffers on `handleUsageUpdate`
- [x] 5.2 Add unit test: `ChatStreamingPipeline` saves message and clears buffers on `handlePromptCompleted`
- [x] 5.3 Add unit test: Multi-phase scenario — `usage_update` followed by `message_chunk` followed by `prompt_completed` saves one combined message
- [x] 5.4 Run full test suite for both packages
