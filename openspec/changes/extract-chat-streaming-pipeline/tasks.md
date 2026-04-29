## 1. Tests (BDD — write before implementation)

- [x] 1.1 Write failing test: thought chunks accumulate in buffer
- [x] 1.2 Write failing test: thought chunk triggers broadcast with correct content
- [x] 1.3 Write failing test: message chunks accumulate in buffer
- [x] 1.4 Write failing test: message chunk triggers broadcast
- [x] 1.5 Write failing test: `handleUsageUpdate` assembles `<details>` format when thoughts present
- [x] 1.6 Write failing test: `handleUsageUpdate` uses plain message when no thoughts
- [x] 1.7 Write failing test: buffers cleared after `handleUsageUpdate`
- [x] 1.8 Write failing test: `getStreamingSnapshot` reflects current buffers
- [x] 1.9 Write failing test: `getStreamingSnapshot` returns empty strings for unknown thread
- [x] 1.10 Write failing test: `clearBuffers` removes all state for thread
- [x] 1.11 Write failing test: duration metadata set in saved message
- [x] 1.12 Confirm all new tests fail before implementation

## 2. Implement ChatStreamingPipeline

- [x] 2.1 Create `packages/mimo-platform/src/sessions/streaming-pipeline.ts`
- [x] 2.2 Define `StreamingSnapshot`, `ExpertPendingEntry`, `CommandList` types
- [x] 2.3 Implement `handleThoughtStart` — record start time, init thought buffer, broadcast
- [x] 2.4 Implement `handleThoughtChunk` — accumulate buffer, broadcast
- [x] 2.5 Implement `handleThoughtEnd` — broadcast
- [x] 2.6 Implement `handleMessageChunk` — fallback start time, accumulate buffer, broadcast
- [x] 2.7 Implement `handleToolCall` — track in tool call buffer, broadcast
- [x] 2.8 Implement `handleToolCallUpdate` — update tool call buffer, broadcast
- [x] 2.9 Implement `handleUsageUpdate` — assemble content, call `saveMessage`, broadcast, clear buffers, check expertPending
- [x] 2.10 Implement `handleAvailableCommandsUpdate` — update commands buffer, broadcast
- [x] 2.11 Implement `getStreamingSnapshot` — return `{ thoughtContent, messageContent }`
- [x] 2.12 Implement `clearBuffers` — delete all keys for the given stream key
- [x] 2.13 Implement `setExpertPending`, `getExpertPending`, `deleteExpertPending`

## 3. Wire into index.tsx

- [x] 3.1 Construct `ChatStreamingPipeline` at the top of `index.tsx` (after `chat` and `broadcast` are available)
- [x] 3.2 Replace `thought_start` case with `pipeline.handleThoughtStart(...)`
- [x] 3.3 Replace `thought_chunk` case with `pipeline.handleThoughtChunk(...)`
- [x] 3.4 Replace `thought_end` case with `pipeline.handleThoughtEnd(...)`
- [x] 3.5 Replace `message_chunk` case with `pipeline.handleMessageChunk(...)`
- [x] 3.6 Replace `tool_call` case with `pipeline.handleToolCall(...)`
- [x] 3.7 Replace `tool_call_update` case with `pipeline.handleToolCallUpdate(...)`
- [x] 3.8 Replace `usage_update` case with `await pipeline.handleUsageUpdate(...)`
- [x] 3.9 Replace `available_commands_update` case with `pipeline.handleAvailableCommandsUpdate(...)`
- [x] 3.10 Replace direct Map reads in `open` and `request_state` handlers with `pipeline.getStreamingSnapshot(...)`
- [x] 3.11 Replace `expertPending` Map in `expert_instruction` handler with `pipeline.setExpertPending(...)`
- [x] 3.12 Replace direct Map reads of `expertPending` in `cancel_request` with `pipeline.deleteExpertPending(...)`
- [x] 3.13 Delete the six module-level Maps from `index.tsx`

## 4. Verification

- [x] 4.1 Run `cd packages/mimo-platform && bun test` — all tests pass
- [x] 4.2 Run `cd packages/mimo-agent && bun test` — no regressions
- [x] 4.3 Confirm module-level `streamingBuffers`, `thoughtBuffers`, `toolCallBuffers`, `messageStartTimes`, `availableCommandsBuffers`, `expertPending` no longer exist in `index.tsx`
