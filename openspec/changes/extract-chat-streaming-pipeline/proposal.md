## Why

`packages/mimo-platform/src/index.tsx` holds six module-level Maps (`streamingBuffers`, `thoughtBuffers`, `toolCallBuffers`, `messageStartTimes`, `availableCommandsBuffers`, `expertPending`) that are effectively singletons — a direct violation of the DI/no-hidden-globals rule. The logic that assembles the final assistant message from thought + tools + message chunks (a ~60-line block inside the `usage_update` case) is untestable business logic buried inside a 2000-line WebSocket handler. Extracting a `ChatStreamingPipeline` service gives this logic a home that can be constructed, injected, and tested in isolation.

## What Changes

- Extract all six module-level streaming Maps out of `index.tsx` into a new `ChatStreamingPipeline` class
- Move streaming event handlers (`thought_start/chunk/end`, `message_chunk`, `tool_call/update`, `usage_update`) into typed methods on the pipeline
- Move the thought + tools + message assembly logic into `handleUsageUpdate` on the pipeline
- `index.tsx` constructs `ChatStreamingPipeline` at the edge and delegates agent streaming events to it
- `handleAgentMessage` streaming cases become one-liners

## Capabilities

### New Capabilities

- `chat-streaming-pipeline`: An injectable service that owns streaming buffers, handles incremental ACP events, assembles the final assistant message, and persists it via `ChatService`.

### Modified Capabilities

<!-- No spec-level behavior changes visible to users or the API -->

## Impact

- `packages/mimo-platform/src/sessions/streaming-pipeline.ts` — new file
- `packages/mimo-platform/src/index.tsx` — remove six module-level Maps, delegate streaming cases to pipeline
- `packages/mimo-platform/test/chat-streaming-pipeline.test.ts` — new test file
