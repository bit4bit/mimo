## Why

The current agent lifecycle model ties agents to sessions at creation time, with the platform spawning and managing the mimo-agent process. This creates an inverted ownership model where the platform manages process lifecycle instead of the user. Users need to create agents independently, receive a token, and run mimo-agent locally—allowing one agent to manage multiple sessions in parallel, each with its own ACP process (opencode, claude, etc.).

## What Changes

- **BREAKING**: Remove platform-spawned agent processes—users now run `mimo-agent --token=XXX` locally
- **BREAKING**: Remove `sessionId` and `projectId` from Agent schema—agents are no longer bound to sessions at creation
- **BREAKING**: Remove `pid` tracking from Agent schema—platform no longer manages process lifecycle
- Add `assignedAgentId` to Session schema—sessions reference agents instead of agents owning sessions
- Add `status: "online" | "offline"` to Agent—derived from WebSocket connection state
- Add agent creation UI—create agent, receive token (always visible, cannot regenerate)
- Add agent dropdown in session creation—associate existing agent with session
- Add agent detail view—show status, token, sessions using this agent
- Remove "Start Agent" button from session detail—replace with agent status badge that shows details on click

## Capabilities

### New Capabilities
- `agent-management`: CRUD operations for agents independent of sessions, token generation (one-time view, always visible), online/offline status tracking via WebSocket

### Modified Capabilities
- `agent-lifecycle`: Remove platform-spawned process management, agent now connects to platform with token, one agent can serve multiple sessions in parallel
- `session-management`: Add agent assignment via dropdown on session creation, session references agent via `assignedAgentId`

## Impact

- **Agent schema**: Remove `sessionId`, `projectId`, `pid`; agent is now independent entity
- **Session schema**: Add `assignedAgentId` (optional foreign key to agent)
- **AgentService**: Remove `spawnAgent()`, `killAgent()`, PID tracking; keep `createAgent()` with token generation and `handleAgentConnect()`/`handleAgentDisconnect()` for status
- **AgentRepository**: Remove session-scoped queries; add `findByStatus()` for online/offline listing
- **UI: Agents page**: Create/Delete agents, show online/offline status, display token in detail view
- **UI: Session create form**: Add agent dropdown populated from user's agents
- **UI: Session detail page**: Remove "Start Agent" button, add agent status badge with detail modal
- **mimo-agent**: Already designed to connect with token—no changes needed, just receives token from user