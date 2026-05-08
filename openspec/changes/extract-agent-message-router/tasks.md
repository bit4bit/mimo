## 1. Tests (BDD — write before implementation)

- [x] 1.1 Write failing test: `thought_start` delegates to `pipeline.handleThoughtStart`
- [x] 1.2 Write failing test: `usage_update` delegates to `pipeline.handleUsageUpdate` and calls `triggerAutoSync`
- [x] 1.3 Write failing test: `session_initialized` persists model/mode and broadcasts to UI clients
- [x] 1.4 Write failing test: concurrent auto-sync for same session is deduplicated
- [x] 1.5 Write failing test: `permission_request` broadcast to UI and tracked by requestId
- [x] 1.6 Write failing test: `permission_response` resolves pending permission promise
- [x] 1.7 Write failing test: rapid activity events produce at most one `touchSessionActivity` call within debounce window
- [x] 1.8 Confirm all new tests fail

## 2. Prerequisite

- [x] 2.1 Confirm `extract-chat-streaming-pipeline` is complete (`ChatStreamingPipeline` exists and is exported)

## 3. Implement AgentMessageRouter

- [x] 3.1 Create `packages/mimo-platform/src/agents/message-router.ts`
- [x] 3.2 Define `AgentMessageRouterDeps` interface with all injected dependencies
- [x] 3.3 Implement constructor storing `deps` and initializing internal Maps/Sets
- [x] 3.4 Implement `handle(agentId, ws, data)` — switch dispatch to private handlers
- [x] 3.5 Implement `handleAgentReady` — session lookup, MCP resolution, thread bootstrap, `session_ready` send
- [x] 3.6 Implement `handleAgentCapabilities` — `agentRepository.updateCapabilities`
- [x] 3.7 Implement `handleSessionInitialized` — persist state, broadcast, update thread model/mode
- [x] 3.8 Implement `handleModelState` / `handleModeState` — persist and broadcast
- [x] 3.9 Implement `handleAcpThreadCreated` — `updateChatThread(acpSessionId)`, system message on reset
- [x] 3.10 Implement `handleAcpThreadCleared` — `updateChatThread`, system message, broadcast
- [x] 3.11 Implement `handleFileChanged` — `fossilUp`, `fileSync.handleFileChanges`
- [x] 3.12 Implement `handlePermissionRequest` — track in `pendingPermissions`, broadcast to UI
- [x] 3.13 Implement `handlePermissionResponse` — resolve pending promise
- [x] 3.14 Implement `touchSessionActivity` with 30s debounce (move from `index.tsx`)
- [x] 3.15 Implement auto-sync deduplication guard (`autoSyncInFlight` Set)
- [x] 3.16 Implement remaining handlers: `acp_status`, `sync_now_result`, `session_error`, `agent_sessions_ready`, `clear_session_error`, `available_commands_update`, `expert_temp_content`, `file_written`, `acp_cancelled`

## 4. Wire into index.tsx

- [x] 4.1 Construct `AgentMessageRouter` in `index.tsx` after all deps are available
- [x] 4.2 Replace `handleAgentMessage` body with `return agentRouter.handle(ws.data.agentId, ws, data)`
- [x] 4.3 Delete `pendingPermissions`, `autoSyncInFlight`, `pendingActivityTouches`, `calculatingSessions` module-level Maps/Sets
- [x] 4.4 Delete the `triggerAutoSync` standalone function (now inside router)
- [x] 4.5 Delete the `touchSessionActivity` standalone function (now inside router)

## 5. Verification

- [x] 5.1 Run `cd packages/mimo-platform && bun test` — all tests pass
- [x] 5.2 Run `cd packages/mimo-agent && bun test` — no regressions
- [x] 5.3 Verify `handleAgentMessage` in `index.tsx` is now a single delegation call
- [x] 5.4 Verify no module-level mutable Maps/Sets remain for agent message state in `index.tsx`
