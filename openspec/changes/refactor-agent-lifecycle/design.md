## Context

The current architecture has the platform spawn and manage mimo-agent processes, binding agents to sessions at creation time. This inverts ownership—users cannot run agents locally, cannot manage multiple sessions with one agent, and cannot see tokens after creation. The refactored architecture moves agent ownership to the user: they create agents (receive tokens), run mimo-agent locally with that token, and agents connect back to the platform to discover their assigned sessions.

Current state:
- Agent schema: `{id, sessionId, projectId, owner, token, status, pid, startedAt, lastActivityAt}`
- AgentService: `spawnAgent()` spawns process, `killAgent()` terminates, tracks PIDs
- Session creation: No agent selection—agent spawned via "Start Agent" button
- Session detail: "Start Agent" button spawns agent on-demand

Target state:
- Agent schema: `{id, owner, token, status, startedAt, lastActivityAt}`
- Session schema: Add `assignedAgentId`
- AgentService: `createAgent()` generates token, `handleAgentConnect()`/`handleAgentDisconnect()` for status
- Session creation: Agent dropdown selects from user's agents
- Session detail: Agent status badge, click for details (no spawn button)

## Goals / Non-Goals

**Goals:**
- Separate agent lifecycle from session lifecycle
- Allow users to create agents and receive tokens
- Allow one agent to serve multiple sessions in parallel
- Track agent online/offline status via WebSocket connection state
- Show agent token in UI (always visible, cannot regenerate)

**Non-Goals:**
- Token regeneration or revocation (out of scope)
- Agent-to-agent communication (out of scope)
- Multi-tenant agent sharing (agent belongs to one owner)

## Decisions

### Agent Ownership Model
**Decision**: Agent is independent entity owned by user, not bound to session at creation.

**Rationale**: 
- Previous model: Agent created when session starts, bound to that session
- New model: Agent created independently, associated with sessions via `assignedAgentId`
- Allows user to run one mimo-agent that manages multiple sessions simultaneously
- Cleaner separation: user controls agent process, platform just tracks connection state

**Alternatives considered**:
- Embed agent ID in session creation form (chosen)
- Auto-assign agent on first connection (rejected: less explicit, harder to track)

### Session-Agent Association
**Decision**: Session has optional `assignedAgentId` foreign key to agent.

**Rationale**:
- Session may exist without agent temporarily (agent not yet created)
- Agent can view which sessions it's responsible for via query
- Many sessions can reference same agent (parallel work)

**Alternatives considered**:
- Agent stores array of session IDs (rejected: harder to query, sync issues)
- Bidirectional reference (rejected: unnecessary complexity)

### Status Tracking
**Decision**: Agent's `status` derived from WebSocket connection state.

**Rationale**:
- Platform already tracks `activeConnections: Map<string, WebSocket>` in AgentService
- On connect: mark agent "online"
- On disconnect: mark agent "offline"
- No polling required—status is event-driven

### Token Visibility
**Decision**: Token always visible in agent detail, never regenerated.

**Rationale**:
- Simplicity: no token versioning, no revocation logic
- User copies token once after creation, or revisits page to copy again
- If compromised, user deletes agent and creates new one

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Token exposed in UI | Token is single-secret; users should treat like password. Future: add expiration or regeneration. |
| Agent disconnects unexpectedly | Status shows "offline"; user can restart mimo-agent locally |
| Session has no agent assigned | Optional field; session creation form allows "None" or agent creation inline |
| Multiple agents, user confusion | UI shows agent details; sessions list which agent is assigned |
| Orphaned agents (user forgets) | Agent list with "delete" option; owners can clean up |