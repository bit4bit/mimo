## Why

After `extract-chat-streaming-pipeline`, the `handleAgentMessage` function in `index.tsx` is still a ~500-line switch statement that directly performs session repository lookups, state updates, capability storage, and auto-sync triggering — all entangled with WebSocket concerns. This violates the "side effects at the boundary" rule: business logic (routing, state persistence, broadcasting) should live in an injectable service, not inline in the WS handler. Extracting `AgentMessageRouter` makes the handler testable, reveals intent, and completes the thinning of `index.tsx` started by `extract-chat-streaming-pipeline`.

## What Changes

- Extract `AgentMessageRouter` class to `packages/mimo-platform/src/agents/message-router.ts`
- Router accepts all dependencies via constructor injection (`pipeline`, `sessionRepository`, `agentRepository`, `agentService`, `broadcast`, `autoSync`, `sessionStateService`, `chat`)
- `handleAgentMessage` in `index.tsx` becomes a two-liner: construct router once, call `router.handle(agentId, data)`
- Each agent message type gets a private typed handler method on the router
- All remaining module-level mutable state in the agent message path (`calculatingSessions`, `autoSyncInFlight`, `pendingPermissions`, `pendingActivityTouches`) moves into the router

## Capabilities

### New Capabilities

- `agent-message-router`: An injectable router that dispatches agent WebSocket messages to typed handlers, holding all agent-message-related state and dependencies explicitly.

### Modified Capabilities

<!-- No spec-level behavior changes visible to clients -->

## Impact

- `packages/mimo-platform/src/agents/message-router.ts` — new file
- `packages/mimo-platform/src/index.tsx` — `handleAgentMessage` reduced to `router.handle(...)`, remove remaining module-level Maps used by agent message handling
- `packages/mimo-platform/test/agent-message-router.test.ts` — new test file
- Depends on `extract-chat-streaming-pipeline` being complete (router accepts `ChatStreamingPipeline` as a dependency)
