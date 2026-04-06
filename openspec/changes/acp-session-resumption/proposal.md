## Why

When mimo-agent restarts, the ACP session is lost even though the chat history persists in mimo-platform. This causes the agent to lose conversation context, resulting in disjointed interactions where the AI behaves as if it's starting fresh. We need to connect mimo-platform sessions with ACP sessions so they share the same ID, and enable session resumption after agent restarts.

## What Changes

- Store `acpSessionId` in mimo-platform session.yaml to persist ACP session references
- Extend WebSocket protocol to send `acpSessionId` from platform to agent on reconnection
- Add `acp_session_created` message from agent to report new/updated session IDs
- Implement capability-aware session resumption:
  - Check if ACP agent supports `loadSession` capability during initialization
  - If supported and `acpSessionId` exists: call `loadSession()` to resume conversation
  - If not supported or no session ID: create new session via `newSession()`
- Add transparent reset notification: when session cannot be resumed, append system message to chat history indicating the reset with timestamp

## Capabilities

### New Capabilities
- `session-acp-persistence`: Persist ACP session IDs in mimo-platform and enable session resumption across agent restarts

### Modified Capabilities
- `agent-communication`: Extend WebSocket protocol with `acpSessionId` field in `session_ready` message and new `acp_session_created` message type

## Impact

- **mimo-platform**: Session repository (YAML persistence), WebSocket handlers, chat service
- **mimo-agent**: AcpClient initialization logic, session management, WebSocket message handlers
- **User experience**: Seamless conversation continuity across agent restarts with clear notification when context is reset
