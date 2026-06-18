## Why

An LLM running inside a chat thread can only act within that single thread. It has
no way to kick off parallel work in a fresh thread (e.g. "spin up a thread to
refactor auth while I keep reviewing here"). Users must manually open a new thread
and re-type the prompt. Exposing thread creation through the existing internal mimo
MCP lets the LLM spawn sibling threads autonomously, seeded with an initial prompt.

## What Changes

- Add a `create_chat_thread` tool to the existing internal mimo MCP endpoint
  (`POST /api/mimo-mcp`). Bare call is `create_chat_thread({ initialPrompt })`;
  `model`, `mode`, and `assignedAgentId` are optional overrides.
- The new thread **inherits** `model`, `mode`, and `assignedAgentId` from the
  **calling** thread unless overridden.
- Thread **name is auto-generated** server-side from the initial prompt (LLM does
  not supply one); it is made unique per session.
- The agent stamps a new `X-Mimo-Thread-Id` header on the mimo MCP config when it
  spawns each per-thread ACP runtime, so the endpoint can identify the calling
  thread. **BREAKING** (internal contract): the header is REQUIRED — a
  `create_chat_thread` call without a resolvable `X-Mimo-Thread-Id` is rejected.
- The seeded `initialPrompt` is delivered as a **user turn** so the new thread's
  LLM acts on it immediately; spawn reuses the existing `initial_prompt` →
  `ensureThreadRuntime` self-warming path.
- Add an optional `list_thread_options` tool returning available agents / models /
  modes, for when the LLM wants to choose overrides.
- The spawned thread appears **live** in an open session UI: the tool broadcasts a
  `chat_thread_created` WebSocket event to the session's clients, and the client
  appends the new thread tab without a reload and without stealing the active tab.
- Out of scope (explicit): no human approval gate, no recursion/depth guard, no
  backward compatibility for the missing header.

## Capabilities

### New Capabilities
- `mcp-thread-creation`: The `create_chat_thread` and `list_thread_options` MCP
  tools — caller-thread identification via `X-Mimo-Thread-Id`, inheritance of
  model/mode/agent, server-side unique auto-naming, initial-prompt seeding of the
  spawned thread, and live UI surfacing of the new thread via a
  `chat_thread_created` WebSocket broadcast.

### Modified Capabilities
- `platform-mcp-server`: tools/list now also advertises `create_chat_thread` (and
  `list_thread_options`); the MCP config injected per thread now carries the
  `X-Mimo-Thread-Id` header identifying the calling thread.

## Impact

- `packages/mimo-platform/src/api/mcp/server.ts` — new tools in tools/list &
  tools/call; `McpRoutesContext` extended with `repos.sessions` and
  `services.agents`.
- `packages/mimo-platform/src/infrastructure/server/bootstrap.tsx` — wire the new
  context dependencies at the `/api/mimo-mcp` mount.
- `packages/mimo-platform/src/domain/agents/message-router.ts` /
  `packages/mimo-platform/src/mcp/platform-config.ts` — per-thread
  `X-Mimo-Thread-Id` header on the mimo MCP config.
- `packages/mimo-agent/src/index.ts` — stamp the caller thread header when
  spawning the per-thread ACP runtime (`doSpawnThreadRuntime`/`respawnAcpProcess`).
- New auto-name helper near the sessions domain
  (`packages/mimo-platform/src/domain/sessions/`).
- Reuses existing `repos.sessions.addChatThread` (unique-name enforcement) and the
  `initial_prompt` agent message path; no REST handler changes.
- `packages/mimo-platform/public/js/chat.js` — handle the new
  `chat_thread_created` WebSocket message; `public/js/chat-threads.js` — append the
  thread to `ChatThreadsState.threads` and call `updateThreadTabsUI()` without
  switching the active thread. The tool emits the broadcast via the existing
  `broadcastToSession(chatSessions, …)` and `toChatThreadResponse` helpers.
