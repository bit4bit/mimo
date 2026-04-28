## 1. Data Model Changes

- [x] 1.1 Update Agent schema: remove sessionId, projectId, pid fields
- [x] 1.2 Update Session schema: add assignedAgentId (optional string field)
- [x] 1.3 Update AgentRepository: remove session-scoped queries, add findByStatus()
- [x] 1.4 Update Agent type definition in TypeScript: remove old fields, keep id, owner, token, status, startedAt, lastActivityAt

## 2. Agent Service Refactor

- [x] 2.1 Refactor AgentService.createAgent(): only create agent record with token, no process spawning
- [x] 2.2 Remove AgentService.spawnAgent() method (no longer used)
- [x] 2.3 Remove AgentService.killAgent() and killAgentsBySession() methods
- [x] 2.4 Remove AgentService.startAgentProcess() and handleProcessExit() (no longer manage processes)
- [x] 2.5 Keep AgentService.handleAgentConnect(): validate token, store WebSocket, mark agent "online"
- [x] 2.6 Keep AgentService.handleAgentDisconnect(): remove WebSocket, mark agent "offline"
- [x] 2.7 Update AgentService.generateAgentToken(): token claims should be {agentId, owner, exp}
- [x] 2.8 Add AgentService.listAgentsByOwner() for agents list page
- [x] 2.9 Add AgentService.deleteAgent() for agent deletion
- [x] 2.10 Remove PID tracking from AgentService and AgentRepository

## 3. Agent Management UI (Create/List/Delete)

- [x] 3.1 Update Agents page: remove Kill/Retry buttons, add Create Agent button
- [x] 3.2 Create GET /agents/new route: show agent creation form
- [x] 3.3 Create POST /agents route: create agent and return token
- [x] 3.4 Update agents list to show online/offline status with 🟢/🔴 icons
- [x] 3.5 Create DELETE /agents/:id route for agent deletion
- [x] 3.6 Update agent detail page to show token with "Copy Token" button
- [x] 3.7 Remove PID column from agents list table
- [x] 3.8 Show "Sessions using this agent" list in agent detail view

## 4. Session Creation with Agent Assignment

- [x] 4.1 Update SessionCreatePage: add agent dropdown populated from user's agents
- [x] 4.2 Add "None" option to agent dropdown (default selection)
- [x] 4.3 Update POST /sessions route: include assignedAgentId in session creation
- [x] 4.4 Update Session schema to store assignedAgentId in session.yaml
- [x] 4.5 Update SessionRepository.create() to handle assignedAgentId field

## 5. Session Detail View Updates

- [x] 5.1 Remove "Start Agent" button from SessionDetailPage
- [x] 5.2 Add agent status badge showing 🟢 online / 🔴 offline / "No agent assigned"
- [x] 5.3 Make agent status badge clickable: opens agent detail modal
- [x] 5.4 Query assigned agent when loading session detail
- [x] 5.5 Display agent name and status in session header
- [x] 5.6 Remove POST /sessions/:id/agent route (no longer spawning agents from sessions)

## 6. WebSocket Authentication Updates

- [x] 6.1 Update agent WebSocket handler to validate token and extract agentId
- [x] 6.2 On agent connect: mark agent "online" in repository
- [x] 6.3 On agent disconnect: mark agent "offline" in repository
- [x] 6.4 Remove process spawning logic from WebSocket connection handler
- [x] 7.1 Add SessionRepository.findByAssignedAgentId() to find sessions using a specific agent
- [x] 7.2 Add route GET /agents/:id/sessions to list sessions for an agent
- [x] 7.3 Include session list in agent detail view

## 8. Tests

- [x] 8.1 Update Agent creation tests: create agent returns token, no spawning
- [x] 8.2 Update Agent listing tests: test online/offline status filtering
- [x] 8.3 Add test: agent WebSocket connect sets status to "online"
- [x] 8.4 Add test: agent WebSocket disconnect sets status to "offline"
- [x] 8.5 Update Session creation tests: test assignedAgentId is stored
- [x] 8.6 Add test: session creation without agent assigns null
- [x] 8.7 Add test: agent deletion clears assignedAgentId from sessions
- [x] 8.8 Remove tests for spawnAgent, killAgent, PID tracking, process management
- [x] 9.1 Remove unused routes (POST /sessions/:id/agent)
- [x] 9.2 Remove unused service methods (spawn, kill, process management)
- [x] 9.3 Update any documentation referencing "Start Agent" button
- [x] 9.4 Verify mimo-agent still connects correctly with token (no changes needed)
- [x] 9.5 Add migration note: existing agents with sessionId will need manual cleanup or migration script