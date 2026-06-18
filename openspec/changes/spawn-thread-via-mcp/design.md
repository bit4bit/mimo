## Context

The internal mimo MCP endpoint (`POST /api/mimo-mcp`, `src/api/mcp/server.ts`)
already exists and exposes one tool, `open_file`. Authentication is a per-session
Bearer token (`mcpTokenStore`: token → `sessionId`). Each chat thread spawns its
own ACP runtime (`doSpawnThreadRuntime`, `mimo-agent/src/index.ts:1580`) and every
runtime is handed the **same** session-level mimo MCP config built once in
`message-router.ts` (`createPlatformMcpServerConfig`). Thread creation already
exists as a REST flow (`addChatThreadHandler`, `handlers.ts:661`) which, when given
`instructions`, sends an `initial_prompt` agent message that lazily spawns the ACP
session and prompts the LLM.

This change adds an MCP tool so the LLM can create sibling threads. The hard part
is identity: the per-session token cannot tell which thread is calling, yet the new
thread must inherit the **calling** thread's model/mode/agent.

## Goals / Non-Goals

**Goals:**
- LLM spawns a sibling thread with just `{ initialPrompt }`.
- New thread inherits model/mode/agent from the calling thread; optional overrides.
- Server auto-generates a unique thread name from the prompt.
- New thread receives the prompt as a user turn and runs immediately.
- Reuse existing `addChatThread` + `initial_prompt` machinery.
- The new thread appears live in an open session UI without a reload.

**Non-Goals:**
- No human approval gate for spawning.
- No recursion/depth/count guard.
- No backward compatibility for a missing caller-thread header.
- No redesign of the thread tab bar — reuse the existing render path
  (`updateThreadTabsUI`); only add a new WS event and its client handler.

## Decisions

### D1: Identify the calling thread via an `X-Mimo-Thread-Id` header, stamped by the agent

The token is per-session, so it cannot identify the calling thread. Options:

- **A. Per-thread token** — mint a distinct MCP token per thread. Rejected: changes
  token minting and the session-level config contract broadly.
- **B. Infer from `session.activeChatThreadId`** — rejected: "active" ≠ "calling"
  once the user switches threads; silently wrong.
- **C (chosen). Caller header injected by the agent per spawn** — the agent knows
  `chatThreadId` in `doSpawnThreadRuntime`, so it appends
  `X-Mimo-Thread-Id: <chatThreadId>` to its copy of the mimo MCP config headers when
  spawning that thread's runtime. The token stays session-level for auth.

The server resolves the new thread's inherited settings by reading the caller thread
identified by this header. **No fallback**: if the header is absent or does not
resolve to a thread in the token's session, `create_chat_thread` returns an error
result. This is an internal contract between agent and platform shipped together;
no backward compatibility is required.

`createPlatformMcpServerConfig` stays session-level. The stamping happens
agent-side because that is the only place `chatThreadId` is in scope at spawn time.

### D2: Inherit model/mode/agent; auto-generate the name

`create_chat_thread({ initialPrompt, title?, model?, mode?, assignedAgentId? })`.
Missing fields are copied from the caller thread record. The resolved `model`/`mode`
(whether overridden or inherited) are then validated against the target agent's
advertised capabilities (`Agent.capabilities.availableModels/availableModes`): if
the value is not supported, the tool returns an error (naming the invalid value and
the valid options) and creates nothing, so the spawned thread never starts with a
model the agent cannot use. An agent that advertises nothing (never connected)
cannot be validated against, so the value passes through. The name comes from the
optional `title` when supplied, else from the `initialPrompt`; both run through the
same `autoName(source, existingNames)` helper, so an LLM-supplied title is also
char-limited. The helper keeps the first few words capped at ~24 chars (short tab
labels), and on collision appends
`" (2)"`, `" (3)"`, … so it satisfies the existing per-session uniqueness rule in
`addChatThread`. `list_thread_options` (optional tool) returns the available
agents/models/modes so the LLM can choose overrides deliberately.

### D3: Seed via the existing `initial_prompt` path (self-warming)

After `repos.sessions.addChatThread(...)` (new thread `acpSessionId: null`,
`state: "active"`), the server calls
`services.agents.sendToAgent(agentId, { type: "initial_prompt", sessionId, chatThreadId, content: initialPrompt })`.
`handleInitialPrompt` already calls `ensureThreadRuntime()`, which spawns the ACP
session when `acpSessionId` is null and then `sendPrompt`s the content as a user
turn. We do **not** depend on the browser `request_state` pre-warm path. `agentId`
is the new thread's `assignedAgentId` (inherited), matching the REST flow.

### D4: MCP tool calls the repo/service directly, bypassing REST auth

The MCP request is already authorized by the session token, so the tool calls
`repos.sessions.addChatThread` and `services.agents.sendToAgent` directly rather
than re-entering the REST handler (which expects user-auth middleware).
`McpRoutesContext` gains `repos.sessions` and `services.agents`; bootstrap wires
them at the `/api/mimo-mcp` mount.

### D5: Surface the spawned thread live via a `chat_thread_created` broadcast

Thread creation has no WebSocket broadcast today — a browser learns of a new thread
only from the REST response when it creates one itself. An MCP-spawned thread has no
browser caller, so without a push it would appear only on the next
`GET /chat-threads` fetch (reload). To make it appear live:

- After `addChatThread`, the tool broadcasts
  `{ type: "chat_thread_created", sessionId, thread: toChatThreadResponse(thread) }`
  to the session's WebSocket clients via the existing
  `broadcastToSession(chatSessions, sessionId, …)` (`chatSessions` is already in
  `McpRoutesContext`).
- The client `handleWebSocketMessage` (`public/js/chat.js`) gains a
  `chat_thread_created` case that appends the thread to `ChatThreadsState.threads`
  (idempotently, ignoring duplicates) and calls `updateThreadTabsUI()`. It does
  **not** switch the active thread — the user stays where they are; the new tab
  simply appears.

The REST create path is unchanged (it still updates its own caller's state
directly); only the MCP path needs the broadcast because it has no in-page caller.

## Risks / Trade-offs

- **Unbounded fan-out** (thread B can spawn C…). → Accepted per scope; no guard.
  Each thread is an independent runtime, so cost—not correctness—is the exposure.
- **Stale/missing header from an older agent build.** → Hard error by design (D1);
  agent + platform ship together, so the header is always present.
- **Auto-name collisions / unhelpful names.** → `autoName` dedupes with a numeric
  suffix and falls back to a generic base when the prompt yields an empty slug.
- **Inherited `assignedAgentId` no longer valid.** → `addChatThread`/agent routing
  surfaces the failure; `list_thread_options` lets the LLM pick a valid override.
- **MCP client resource support is irrelevant** — discovery is a tool
  (`list_thread_options`), not an MCP resource, matching the server's tools-only
  surface.
