## Why

The chat UI currently shows no information about what tools the agent is using during execution. Users see only the final response without understanding the agent's actions. This lack of visibility makes it difficult to:
- Track which tools are being called (e.g., grep, read, edit, bash)
- Understand the sequence of operations the agent performs
- Identify slow or failing tool calls for debugging

## What Changes

- **ACP providers (opencode.ts, claude-agent.ts)**: Add `tool_use/tool_result` mapping to forward tool execution events:
  - Emit `tool_start` when a tool begins execution (includes tool name, input summary)
  - Emit `tool_end` when a tool completes (includes tool name, status, duration)

- **mimo-agent**: Add tool message handling in the `sessionUpdate` handler:
  - Parse `tool_start` and `tool_end` events from ACP providers
  - Emit structured `tool_execution` messages to clients

- **mimo-platform**: Forward tool execution messages via WebSocket

- **chat.js**: Add tool rendering in chat display:
  - Show tool name and icon when tool starts
  - Display status (running, success, error) with visual indicator
  - Show execution duration on completion

## Capabilities

### New Capabilities
- `agent-tool-display`: Display real-time tool execution information in chat thread

### Modified Capabilities
- *(none - no existing spec changes)*

## Impact

- **ACP providers (opencode.ts, claude-agent.ts)**: Add tool event handlers
- **mimo-agent**: Add tool message parsing in sessionUpdate handler
- **mimo-platform**: Add tool message type routing
- **chat.js**: Add tool execution UI components

All changes are additive and backward compatible - existing chat responses without tool information continue to work.