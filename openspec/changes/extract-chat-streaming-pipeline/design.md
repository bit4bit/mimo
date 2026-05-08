## Context

`index.tsx` currently holds streaming state as module-level Maps and handles all streaming event logic inline inside `handleAgentMessage`. The six Maps form an implicit singleton that cannot be injected into tests. The message assembly code (thought + tools → `<details>` block, then prepend to message content) is ~60 lines of inline logic that has no test coverage. The `streamKey(sessionId, chatThreadId)` function is the shared key format used by all Maps.

## Goals / Non-Goals

**Goals:**

- `ChatStreamingPipeline` class owns all streaming buffers; constructed once at the `index.tsx` boundary and injected
- Each ACP streaming event has a dedicated typed method on the pipeline
- `handleUsageUpdate` assembles the full message and calls `ChatService.saveMessage` — same behavior as today, but testable
- `getStreamingSnapshot(key)` supports `request_state` replay (same data currently read directly from module-level Maps)
- `clearBuffers(key)` supports cancel cleanup
- `index.tsx` streaming cases delegate entirely to the pipeline (one-liners)

**Non-Goals:**

- Changing the assembled message format (`<details>` wrapping)
- Changing persistence timing (still saved at `usage_update`)
- Extracting the full `handleAgentMessage` router (that is `extract-agent-message-router`)

## Decisions

### Class with injected `ChatService` and `broadcast` function

```ts
type BroadcastFn = (
  sessionId: string,
  message: Record<string, unknown>,
) => void;

class ChatStreamingPipeline {
  private streamingBuffers = new Map<string, string>();
  private thoughtBuffers = new Map<string, string>();
  private toolCallBuffers = new Map<string, Map<string, any>>();
  private messageStartTimes = new Map<string, number>();
  private availableCommandsBuffers = new Map<string, CommandList>();
  private expertPending = new Map<string, ExpertPendingEntry>();

  constructor(
    private chat: ChatService,
    private broadcast: BroadcastFn,
  ) {}

  handleThoughtStart(sessionId: string, threadId: string): void;
  handleThoughtChunk(
    sessionId: string,
    threadId: string,
    content: string,
  ): void;
  handleThoughtEnd(sessionId: string, threadId: string): void;
  handleMessageChunk(
    sessionId: string,
    threadId: string,
    content: string,
  ): void;
  handleToolCall(sessionId: string, threadId: string, tool: ToolCallData): void;
  handleToolCallUpdate(
    sessionId: string,
    threadId: string,
    update: ToolCallUpdate,
  ): void;
  handleUsageUpdate(
    sessionId: string,
    threadId: string,
    usage: UsageData,
    session: SessionRecord,
  ): Promise<void>;
  handleAvailableCommandsUpdate(
    sessionId: string,
    threadId: string,
    commands: CommandList,
  ): void;
  getStreamingSnapshot(sessionId: string, threadId?: string): StreamingSnapshot;
  clearBuffers(sessionId: string, threadId?: string): void;
  setExpertPending(
    sessionId: string,
    threadId: string,
    entry: ExpertPendingEntry,
  ): void;
  getExpertPending(
    sessionId: string,
    threadId: string,
  ): ExpertPendingEntry | undefined;
  deleteExpertPending(sessionId: string, threadId: string): void;
}
```

**Alternative considered**: Free functions that take the Maps as parameters. Rejected — caller must manage Maps (still a singleton concern) and function signatures grow unbounded.

### `handleUsageUpdate` assembles message and calls `saveMessage`

The `usage_update` handler in `index.tsx` currently reads `streamingBuffers`, `thoughtBuffers`, `toolCallBuffers`, assembles the full content string, calls `chat.saveMessage`, then broadcasts. All of this moves into `handleUsageUpdate`. The method is `async` and receives the resolved `SessionRecord` (already fetched by the caller in `index.tsx`) to get `activeChatThreadId`.

**Alternative considered**: Pipeline fetches session itself. Rejected — pipeline should not have a `SessionRepository` dependency; the caller already has the session.

### `streamKey` stays as a private helper inside the pipeline

The `streamKey(sessionId, chatThreadId?)` function (currently in `index.tsx`) moves inside `ChatStreamingPipeline` as a private static method. No external callers.

### `getStreamingSnapshot` returns `{ thoughtContent, messageContent }`

Used by `index.tsx` `request_state` and `open` handlers to replay in-progress streaming to newly connected or thread-switching clients. Preserves existing behavior.

## Risks / Trade-offs

- **`handleUsageUpdate` is async** → Caller in `index.tsx` must `await` it. Currently the `usage_update` case already awaits DB calls inline, so this is no change.
- **`expertPending` colocation** → Currently `expertPending` is a separate Map in `index.tsx`. Moving it into the pipeline couples expert-mode state to the streaming pipeline. Acceptable: expert pending is triggered by a `usage_update` completing, so it belongs in the same lifecycle.

## Migration Plan

1. Create `packages/mimo-platform/src/sessions/streaming-pipeline.ts` with the class and full test suite
2. Construct `ChatStreamingPipeline` in `index.tsx` at the top of the file
3. Replace each inline streaming case with a delegation call
4. Delete the six module-level Maps
5. Confirm tests pass, confirm `index.tsx` streaming logic is gone
