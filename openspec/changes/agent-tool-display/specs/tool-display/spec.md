# Agent Tool Display - Chat UI Specification

## Overview

Display real-time tool execution information inline within the agent's thought section in the chat thread. Based on ACP protocol's `tool_call` and `tool_call_update` session update types.

## Message Types

### tool_call (starts a tool)
```typescript
{
  type: "tool_call",
  sessionId: string,
  chatThreadId: string,
  toolCallId: string,    // Unique ID for tracking updates
  toolTitle: string,    // Human-readable title (e.g., "Read file src/index.ts")
  toolKind?: string,    // Category: "read" | "edit" | "bash" | "search" | ...
  toolInput?: string,   // Truncated input (200 chars)
  toolStatus: "pending" | "in_progress" | "completed" | "failed",
  timestamp: string
}
```

### tool_call_update (progress/result)
```typescript
{
  type: "tool_call_update",
  sessionId: string,
  chatThreadId: string,
  toolCallId: string,   // Matches tool_call to update
  toolStatus?: "pending" | "in_progress" | "completed" | "failed",
  toolOutput?: string,   // Truncated output (500 chars)
  timestamp: string
}
```

## UI Components

### Tool Execution Row (Agent Box)
- **Location**: Inside thought section of agent's streaming message bubble
- **Icon**: Mapped from `toolKind`:
  - `read`, `file` → 📁
  - `edit`, `write` → 📝
  - `bash`, `shell`, `cmd` → ⚡
  - `search`, `grep` → 🔍
  - `glob`, `find` → 🔎
  - default → 🔧
- **Title**: Bold, 0.9em
- **Status indicator**:
  - `pending`: ⏳ (gray #888)
  - `in_progress`: 🔄 (animated spin, blue #339af0)
  - `completed`: ✓ (green #51cf66)
  - `failed`: ✗ (red #ff6b6b)

### Layout
- Inserted inside thought section after thought_start
- Stacked vertically for multiple tools
- Collapsed when thought section is collapsed
- Updated in place when `tool_call_update` arrives (matched by toolCallId)

### State Management
- Platform maintains `toolCallBuffers` Map for history persistence
- On `tool_call`: add new entry to buffer, forward to client
- On `tool_call_update`: update existing entry in buffer, forward to client
- On `usage_update`: generate HTML, append to message content for storage

## History Persistence
Tool calls are stored as structured JSON inside the thought section:

```html
<details><summary>Thought Process</summary>
  ...thought text...
  <tools>[{"title": "Read file", "kind": "read", "status": "completed", "input": "src/index.ts"}, ...]</tools>
</details>
```

Format: `<tools>[{title, kind, status, input}, ...]</tools>`

Benefits:
- Clean separation: store data, not presentation
- Easy to parse and render with correct icons/status on history load
- Future-proof if we want to change UI

## Example

```
You
│ Find all TODO comments in the codebase

Agent
│ ▼ Thought Process                                   [collapse]
│   📁 Read file package.json               🔄 in_progress
│   ⚡ bash find src -name "*.ts"            🔄 in_progress
│   🔍 Grep "TODO" in src/                   ⏳ pending
│
│ Here are the TODO comments found:
│   - src/index.ts:42  // TODO: handle errors
│   - src/utils.ts:15  // TODO: add tests
│
│   ✓ Found 12 TODO comments across 5 files
```

## Acceptance Criteria

1. **Agent box only**: Tool calls appear inside agent's thought section, not user box
2. **Real-time updates**: `tool_call_update` changes status icon live
3. **Multiple tools**: Render in order, updates apply to correct tool via toolCallId
4. **Collapsed thought**: Tools hidden when thought section collapsed
5. **History preserved**: Tool calls saved as HTML in message content
6. **Reload survives**: On page reload, history loads with tool calls visible
7. Backward compatible: Messages without tool data work as before