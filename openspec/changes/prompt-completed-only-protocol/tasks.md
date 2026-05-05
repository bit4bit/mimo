## 1. mimo-agent — Keep usage_update as-is, ensure prompt_completed fires after all chunks

- [x] 1.1 Verify `onUsageUpdate` callback in `buildAcpCallbacks` only sends `usage_update` with no side effects (**already true**, confirm)
- [x] 1.2 Verify `prompt_completed` is sent from `onPromptCompleted` callback (**already true**, confirm)

## 2. mimo-platform streaming pipeline — Remove save/clear from handleUsageUpdate

- [x] 2.1 In `packages/mimo-platform/src/domain/sessions/streaming-pipeline.ts`, review `handleUsageUpdate` — remove any persistence or buffer-clear logic; must stay as pure broadcast-only
- [x] 2.2 Verify `handlePromptCompleted` saves message and clears buffers (`buildAndClearAssistantContent`) — already true, confirm
- [x] 2.3 Verify `flushAsCancelled` saves partial content and marks cancelled — already true, confirm
- [x] 2.4 Remove debug `logger.debug` statements added during prior investigation in `streaming-pipeline.ts`

## 3. mimo-platform message router — Ensure usage_update only routes to pipeline.handleUsageUpdate

- [x] 3.1 In `packages/mimo-platform/src/domain/agents/message-router.ts`, review `handleUsageUpdate` — confirm it only calls `pipeline.handleUsageUpdate` with no extra side effects
- [x] 3.2 Verify `handlePromptCompleted` passes `data.usage` to `pipeline.handlePromptCompleted` (if available) so usage bar can be updated on finalization
- [x] 3.3 Remove debug `logger.debug` statements added during prior investigation in `message-router.ts`

## 4. mimo-platform UI — Remove fallback timer, keep usage_update display-only

- [x] 4.1 In `packages/mimo-platform/public/js/chat.js`, remove `promptCompletedTimeout` fallback timer logic from `handleUsageUpdate`
- [x] 4.2 Remove `clearPromptCompletedFallback` calls in `handleThoughtStart`, `handleMessageChunk`, `handlePromptReceived`, `handlePromptCompleted`
- [x] 4.3 In `handleUsageUpdate`, remove `finalizeMessageStream` call — usage_update only updates usage footer display, never finalizes
- [x] 4.4 In `handlePromptCompleted`, ensure usage footer is updated from `data.usage` if available; otherwise keep existing usage bar state
- [x] 4.5 Remove all debug `console.log` statements added during investigation (search for `[chat]` prefix)

## 5. Tests

- [x] 5.1 Update unit tests for `chat-streaming-pipeline.test.ts`: assert `usage_update` never triggers `saveMessage` or clears buffers
- [x] 5.2 Update unit tests for agent-router: verify `usage_update` routing has no persistence side effects
- [ ] 5.3 Run full test suites for both packages and verify zero regressions
