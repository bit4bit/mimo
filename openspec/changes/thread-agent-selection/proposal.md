## Why

Session creation currently requires selecting an agent upfront, coupling workspace setup with agent assignment before any conversation exists. This is the wrong level of granularity — agent assignment belongs at the thread level, where each conversation can independently choose its agent, model, and mode.

## What Changes

- **BREAKING**: Remove agent selector from session creation form and route
- **BREAKING**: `ChatThread` gains `assignedAgentId` field — agent is now assigned per thread
- Agents advertise capabilities (`availableModels`, `defaultModelId`, `availableModes`, `defaultModeId`) via a new `agent_capabilities` protocol message sent on connect; platform persists these to `agent.yaml`
- Thread creation dialog gains agent selector; selecting an agent synchronously fetches its cached capabilities and populates model/mode dropdowns with defaults
- ACP session notification (`session_ready`) moves from session creation to thread creation
- `session_initialized` response re-caches capabilities on the agent entity
- Session entity no longer holds or requires `assignedAgentId` at creation time

## Capabilities

### New Capabilities

- `agent-capabilities-advertisement`: Agent advertises its available models and modes on connect; platform stores and serves these capabilities per agent

### Modified Capabilities

- `session-management`: Session creation no longer requires agent selection; `assignedAgentId` moves from session to thread
- `agent-lifecycle`: Agent entity gains persisted capabilities cache; connect handshake gains `agent_capabilities` message type

## Impact

- `packages/mimo-platform/src/agents/repository.ts` — `Agent` / `AgentData` interfaces gain capabilities fields
- `packages/mimo-platform/src/sessions/repository.ts` — `ChatThread` interface gains `assignedAgentId`
- `packages/mimo-platform/src/sessions/routes.tsx` — session creation removes agent handling; thread creation adds agent notification
- `packages/mimo-platform/src/components/SessionCreatePage.tsx` — agent selector removed
- `packages/mimo-platform/public/js/chat-threads.js` — thread dialog gains agent selector with reactive model/mode population
- `packages/mimo-platform/src/index.tsx` — new `agent_capabilities` message handler; `session_initialized` re-caches capabilities on agent
- New route: `GET /agents/:agentId/capabilities` — returns cached model/mode state for a given agent
