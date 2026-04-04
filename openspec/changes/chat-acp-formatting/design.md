## Context

The mimo platform uses ACP (Agent Client Protocol) to communicate with coding agents. ACP sends streaming updates via `sessionUpdate` notifications containing raw JSON like:
- `{sessionUpdate: "agent_thought_chunk", content: {...}}`
- `{sessionUpdate: "agent_message_chunk", content: {...}}`
- `{sessionUpdate: "usage_update", cost: {...}}`
- `{sessionUpdate: "available_commands_update", ...}`

Currently, mimo-agent forwards these as raw JSON strings, which display poorly in the UI.

## Goals / Non-Goals

**Goals:**
- Parse ACP updates into structured event types
- Display agent thoughts in a collapsible UI section
- Stream message content cleanly without JSON wrapper
- Show usage/cost information under the Send button
- Hide `available_commands_update` (not relevant for chat UI)

**Non-Goals:**
- Modify ACP protocol itself
- Implement command palette or available commands UI
- Handle tool calls or file operations in chat
- Save thought content to message history

## Decisions

### 1. Parse updates in mimo-agent vs mimo-platform
**Decision**: Parse in mimo-agent before forwarding to platform.

**Rationale**: 
- Agent already has ACP SDK types and knows the protocol
- Platform stays agnostic to ACP specifics
- Easier to add new update types later in one place

**Alternative considered**: Parse in platform. Rejected because it couples platform too tightly to ACP schema.

### 2. Separate thought and message streams
**Decision**: Emit distinct event types (`thought_start/thought_chunk/thought_end` vs `message_chunk`).

**Rationale**:
- UI needs to render them differently (collapsible vs inline)
- Thoughts are ephemeral, messages are persisted
- Clearer separation of concerns

### 3. Buffer thoughts in agent vs stream each chunk
**Decision**: Buffer thought chunks and forward as single `thought_start` → `thought_chunk`s → `thought_end` sequence.

**Rationale**:
- ACP already sends them as separate updates
- UI can collapse/expand after receiving complete thought
- Streaming each chunk separately adds no value for thoughts

### 4. CSS-only collapse vs JavaScript state
**Decision**: Use CSS `display: none/block` with click handler, no persistent state.

**Rationale**:
- Simple implementation
- Thoughts are transient, no need for persistence
- Matches expected chat UI behavior

## Risks / Trade-offs

- **[Risk] ACP protocol changes**: If ACP schema changes, agent needs updates.
  → **Mitigation**: Agent uses `@agentclientprotocol/sdk` types, will fail fast on breaking changes

- **[Risk] Thoughts take up space**: Even collapsed, thought headers add UI elements.
  → **Mitigation**: Minimal styling (compact header, muted colors)

- **[Trade-off] Usage only shows on completion**: Cost is shown after full response, not streaming.
  → **Acceptance**: Usage data arrives separately via `usage_update`, showing earlier would require more complex buffering

## Migration Plan

1. Deploy updated mimo-agent (backwards compatible - old `acp_response` still works)
2. Deploy updated mimo-platform (new message types, old still handled)
3. Refresh browser sessions to load new chat.js

No database migration needed. No breaking changes.

## Open Questions

- Should thoughts be persisted to history? Currently they are not, only visible during active streaming.
- Should there be a "show raw JSON" toggle for debugging? Not needed for now.
