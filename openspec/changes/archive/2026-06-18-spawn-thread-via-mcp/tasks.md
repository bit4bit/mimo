## 1. Auto-name helper (mimo-platform)

- [x] 1.1 Write failing tests for `autoName(initialPrompt, existingNames)`: derives a slug from the first ~40 chars; dedupes collisions with `" (2)"`, `" (3)"`; falls back to a generic default on empty/whitespace prompt
- [x] 1.2 Implement `autoName` near `packages/mimo-platform/src/domain/sessions/`
- [x] 1.3 Verify tests pass

## 2. Per-thread caller header (mimo-agent)

- [x] 2.1 Write failing test: when the agent spawns a thread's ACP runtime, the mimo MCP config handed to it carries header `X-Mimo-Thread-Id: <chatThreadId>` while preserving the existing `Authorization` Bearer header
- [x] 2.2 In `packages/mimo-agent/src/index.ts` (`doSpawnThreadRuntime`/`respawnAcpProcess`), clone the mimo MCP config for the thread and append the `X-Mimo-Thread-Id` header (do not mutate the shared session-level config)
- [x] 2.3 Verify test passes; confirm non-mimo MCP server configs are untouched

## 3. Extend MCP routes context (mimo-platform)

- [x] 3.1 Add `repos.sessions` and `services.agents` to the `McpRoutesContext` interface in `packages/mimo-platform/src/api/mcp/server.ts`
- [x] 3.2 Wire the new dependencies at the `/api/mimo-mcp` mount in `packages/mimo-platform/src/infrastructure/server/bootstrap.tsx`
- [x] 3.3 Confirm existing `open_file` behavior and tests are unaffected

## 4. create_chat_thread tool (mimo-platform)

- [x] 4.1 Write failing tests covering the `mcp-thread-creation` spec scenarios: inherited spawn, override spawn, missing/unresolvable `X-Mimo-Thread-Id` → error, missing `initialPrompt` → error, new thread created with `acpSessionId` null + `state` "active"
- [x] 4.2 Add `create_chat_thread` to `tools/list` with required `initialPrompt` and optional `model`/`mode`/`assignedAgentId`
- [x] 4.3 In `tools/call`, resolve the caller thread from the `X-Mimo-Thread-Id` header against the token's session; hard-error if absent or unresolved
- [x] 4.4 Inherit `model`/`mode`/`assignedAgentId` from the caller thread, applying any provided overrides
- [x] 4.5 Generate a unique name via `autoName` and call `repos.sessions.addChatThread`
- [x] 4.6 Send `initial_prompt` to the new thread's assigned agent via `services.agents.sendToAgent` so the runtime self-warms and the LLM receives the prompt as a user turn
- [x] 4.7 Return `{ success: true, threadId, name }`; verify tests pass

## 5. list_thread_options tool (mimo-platform)

- [x] 5.1 Write failing test: `list_thread_options` with a valid token returns available agents, models, and modes
- [x] 5.2 Add `list_thread_options` to `tools/list` and implement it in `tools/call`
- [x] 5.3 Verify test passes

## 6. Integration & docs

- [x] 6.1 Integration test: a `create_chat_thread` call (real `SessionRepository`, end-to-end through the router) persists a new inheriting thread and dispatches `initial_prompt` to its agent. (Live UI surfacing added in task group 7.)
- [x] 6.2 Ran unit suites: mimo-platform 1073 pass / 1 fail (pre-existing, unrelated `edit-buffer-mention-mode`), mimo-agent 160 pass / 0 fail. New + adjacent MCP suites all green.
- [x] 6.3 No doc enumerates mimo MCP tools (no `open_file`/`mimo-mcp` references in `llms/`, README, or `docs/`) — nothing to update.

## 7. Live UI surfacing of spawned thread

- [x] 7.1 Write failing test: `create_chat_thread` broadcasts a `chat_thread_created` message (with `sessionId` and the thread payload) to the session's WebSocket clients on success, and does NOT broadcast on error
- [x] 7.2 In `create_chat_thread` (`api/mcp/server.ts`), after `addChatThread`, call `broadcastToSession(mimoContext.chatSessions, sessionId, { type: "chat_thread_created", sessionId, thread: toChatThreadResponse(thread) })`
- [x] 7.3 Add a `chat_thread_created` case to `handleWebSocketMessage` in `public/js/chat.js` that appends the thread to `ChatThreadsState.threads` (idempotent — skip if id already present), calls `updateThreadTabsUI()`, and does NOT switch the active thread
- [x] 7.4 Verify tests pass and run the mimo-platform unit suite
