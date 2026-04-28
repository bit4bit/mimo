## Why

The chat UI currently displays raw JSON from ACP responses, making it unreadable. Agent thoughts and usage data are mixed with actual responses, creating a cluttered experience. Users need a clean chat interface that separates reasoning from responses and shows cost information clearly.

## What Changes

- **mimo-agent**: Parse ACP `sessionUpdate` events and emit structured message types:
  - `thought_start/thought_chunk/thought_end` for agent reasoning
  - `message_chunk` for actual responses
  - `usage_update` for cost/token information
  - Filter out `available_commands_update` events

- **mimo-platform**: Forward structured message types from agent to WebSocket clients

- **chat.js**: Update UI to handle new message types:
  - Display thoughts in collapsible gray section (▶ Thinking... / ▼ Thought process)
  - Stream message content without JSON wrapper
  - Show usage/cost under Send button

## Capabilities

### New Capabilities
- `acp-chat-formatting`: Parse and format ACP streaming responses with proper separation of thoughts, messages, and metadata

### Modified Capabilities
- *(none - no existing spec changes)*

## Impact

- **mimo-agent**: New message parsing logic in ACP sessionUpdate handler
- **mimo-platform**: New message type routing in agent connection handler
- **mimo-platform frontend**: Updated chat.js with collapsible thoughts and usage display

All changes are additive and backward compatible - existing raw `acp_response` messages still work.
