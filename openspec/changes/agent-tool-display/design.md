## Architecture

### Message Flow

```
ACP Process
    │
    ▼
┌─────────────────────────────────────────────┐
│ IAcpProvider.mapUpdateType()                 │
│ - tool_use → "tool_start"                    │
│ - tool_result → "tool_end"                  │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ AcpClient.handleSessionUpdate()             │
│ - Parse tool events                          │
│ - Call onToolStart/onToolEnd callbacks      │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ mimo-agent (index.ts)                        │
│ - Send {type: "tool_start", toolName, ...} │
│ - Send {type: "tool_end", toolName, ...}   │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ mimo-platform (index.tsx)                   │
│ - Forward tool messages to WebSocket        │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ chat.js                                      │
│ - renderToolExecution() component           │
│ - Inline in thought section                 │
└─────────────────────────────────────────────┘
```

## Implementation Details

### 1. ACP Provider Types (`types.ts`)

Add callback types:
```typescript
onToolCall: (sessionId: string, tool: { 
  toolCallId: string;
  title: string;
  kind?: string;
  rawInput?: unknown;
  status: "pending" | "in_progress" | "completed" | "failed";
}) => void;

onToolCallUpdate: (sessionId: string, tool: {
  toolCallId: string;
  status?: "pending" | "in_progress" | "completed" | "failed";
  rawOutput?: unknown;
  content?: unknown[];
}) => void;
```

### 2. Provider Mappings

**opencode.ts**:
```typescript
mapUpdateType(updateType: string): string | null {
  const mapping: Record<string, string | null> = {
    agent_thought_chunk: "thought_chunk",
    agent_message_chunk: "message_chunk",
    usage_update: "usage_update",
    tool_call: "tool_call",           // NEW - tool starts
    tool_call_update: "tool_call_update", // NEW - tool progress/result
    available_commands_update: null,
  };
  return mapping[updateType] ?? null;
}
```

**claude-agent.ts**: Same mappings added.

### 3. Client Handling (`client.ts`)

Add case handlers in `handleSessionUpdate()`:
```typescript
case "tool_call":
  // Tool starts - track toolCallId and initial state
  this.callbacks.onToolCall(this.sessionId, {
    toolCallId: update.toolCallId,
    title: update.title,
    kind: update.kind,
    rawInput: update.rawInput,
    status: update.status || "pending",
  });
  break;

case "tool_call_update":
  // Tool progress/result - updates status, content, output
  this.callbacks.onToolCallUpdate(this.sessionId, {
    toolCallId: update.toolCallId,
    status: update.status,
    rawOutput: update.rawOutput,
    content: update.content,
  });
  break;
```

### 4. mimo-agent Message Types (`index.ts`)

Wire callbacks:
```typescript
onToolCall: (sessionId, tool) => {
  this.send({
    type: "tool_call",
    sessionId,
    chatThreadId,
    toolCallId: tool.toolCallId,
    toolTitle: tool.title,
    toolKind: tool.kind,
    toolInput: truncate(JSON.stringify(tool.rawInput), 200),
    toolStatus: tool.status,
    timestamp: new Date().toISOString(),
  });
},

onToolCallUpdate: (sessionId, update) => {
  this.send({
    type: "tool_call_update",
    sessionId,
    chatThreadId,
    toolCallId: update.toolCallId,
    toolStatus: update.status,
    toolOutput: update.rawOutput ? truncate(String(update.rawOutput), 500) : undefined,
    timestamp: new Date().toISOString(),
  });
},
```

### 5. mimo-platform Routing (`index.tsx`)

Add case handlers after existing thought/message handlers:
```typescript
// Buffer for persisting tool calls
const toolCallBuffers = new Map<string, Map<string, any>>();

case "tool_call":
  // Track tool in buffer for history persistence
  const toolStreamKey = streamKey(toolSessionId, toolThreadId);
  if (!toolCallBuffers.has(toolStreamKey)) {
    toolCallBuffers.set(toolStreamKey, new Map());
  }
  toolCallBuffers.get(toolStreamKey)!.set(data.toolCallId, { ... });

  // Forward to clients
  break;

case "tool_call_update":
  // Update existing tool in buffer
  const toolCallsMap = toolCallBuffers.get(updateStreamKey);
  if (toolCallsMap?.has(data.toolCallId)) {
    // Update status/output
  }
  // Forward to clients
  break;
```

**History persistence**: On `usage_update`, generate HTML from toolCallBuffer and prepend to message content before saving to database.

### 6. UI Rendering (`chat.js`)

**Critical**: Use `ChatState.streaming.thoughtElement` (agent's thought section), not `document.querySelector(".message-content")`.

**New function** `renderToolCall(toolCallId, title, kind, status)`:
- Tool title with icon mapped from `toolKind`
- Status indicator based on `toolStatus`
- Append to thought section (agent box only)

**State management**: Maintain `Map<toolCallId, ToolDisplayState>` for active tools.

**Integration**: Call from `handleToolCall/handleToolCallUpdate` to render tools inside thought section.

## Compatibility

All changes are additive. Existing messages without tool info continue to work unchanged. The UI gracefully handles messages without tool data.

## Edge Cases

- Multiple tools in sequence: render in order
- Tool with no result: show start, then mark as timeout after 30s
- Tool input truncation: show first 100 chars + "..." if longer
- Concurrent tools: stack vertically in thought section