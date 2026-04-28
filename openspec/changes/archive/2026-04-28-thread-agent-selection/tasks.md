## 1. Agent Entity — Capabilities Cache

- [x] 1.1 Add `capabilities` fields to `Agent` and `AgentData` interfaces in `agents/repository.ts` (`availableModels`, `defaultModelId`, `availableModes`, `defaultModeId`)
- [x] 1.2 Add `updateCapabilities(agentId, capabilities)` method to `AgentRepository`
- [x] 1.3 Write tests for `updateCapabilities` persisting and reading back from `agent.yaml`

## 2. Protocol — agent_capabilities Message

- [x] 2.1 Add `agent_capabilities` message handler in `index.tsx` that calls `agentRepository.updateCapabilities`
- [x] 2.2 Update `session_initialized` handler to also re-cache capabilities on agent entity
- [x] 2.3 Write tests for `agent_capabilities` handler storing capabilities
- [x] 2.4 Write tests for `session_initialized` re-caching capabilities on agent

## 3. API — Capabilities Endpoint

- [x] 3.1 Add `GET /agents/:agentId/capabilities` route that returns cached capabilities (404 if none)
- [x] 3.2 Write tests for capabilities endpoint (200 with data, 404 when not cached)

## 4. Thread Entity — assignedAgentId

- [x] 4.1 Add `assignedAgentId: string | null` to `ChatThread` interface in `sessions/repository.ts`
- [x] 4.2 Update `addChatThread` method to accept and persist `assignedAgentId`
- [x] 4.3 Write tests for thread creation with and without `assignedAgentId`

## 5. Thread Creation Route — Agent Notification

- [x] 5.1 Update `POST /sessions/:id/chat-threads` handler in `routes.tsx` to accept `assignedAgentId`
- [x] 5.2 After thread creation, if `assignedAgentId` is set and agent is online, send `session_ready` to that agent
- [x] 5.3 Write tests for thread creation route triggering `session_ready` when agent is online
- [x] 5.4 Write tests for thread creation without agent (no notification sent)

## 6. Agent Connect — session_ready Uses Thread Assignments

- [x] 6.1 Update agent connect logic to look up sessions via thread assignments (not session `assignedAgentId`)
- [x] 6.2 Include `threads` array per session in `session_ready` payload
- [x] 6.3 Write tests for agent connect finding sessions via thread assignments

## 7. Session Creation — Remove Agent Selector

- [x] 7.1 Remove agent selector from `SessionCreatePage.tsx`
- [x] 7.2 Remove `assignedAgentId` from session creation POST handler in `routes.tsx`
- [x] 7.3 Remove agent fetch from session creation route handler
- [x] 7.4 Write tests confirming session creation no longer accepts or stores `assignedAgentId`

## 8. Thread Creation Dialog — Agent Selector

- [x] 8.1 Add agent selector dropdown to `showCreateThreadDialog()` in `chat-threads.js`
- [x] 8.2 Populate agent dropdown from a new `GET /agents` or existing agents endpoint (online agents only)
- [x] 8.3 On agent `onChange`, fetch `GET /agents/:agentId/capabilities` and populate model/mode dropdowns
- [x] 8.4 Set model default to `defaultModelId` and mode default to `defaultModeId` from capabilities response
- [x] 8.5 Include `assignedAgentId` in thread creation POST payload
- [x] 8.6 Handle case where no agent is selected (thread created without agent assignment)
