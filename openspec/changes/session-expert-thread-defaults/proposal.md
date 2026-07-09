## Why

Expert mode currently binds to the session's single active chat thread (`window.MIMO_CHAT_THREADS.getActiveThreadId()`), so the user must click `+` and pick an agent+model before expert mode has anything to talk to. There is no way to opt into "an expert-mode thread" at session creation, and no concept of a thread dedicated to expert mode. Sessions start with `chatThreads: []` and `activeChatThreadId: null`, leaving expert mode blocked until the user manually creates a thread that is shared with the chat side.

## What Changes

- Add **optional** agent + model selects to the session-creation form, labeled for expert mode. Mode is auto-derived from the agent's `defaultModeId`.
- When the optional expert agent+model are provided **and** the agent is online at session-creation time, the system auto-creates a chat thread named "Expert" using those settings and marks it as the session's **active expert thread**.
- If the agent is offline at session-creation time, the expert inputs are silently ignored (no error, no pending state) — expert mode follows the existing "no thread" flow until the user creates one normally.
- Add a new session field `activeExpertThreadId: string | null`, fully independent from `activeChatThreadId`.
- Expert mode reads `activeExpertThreadId` instead of `getActiveThreadId()`. When `activeExpertThreadId` is null, expert mode shows "Create a chat thread first" (existing behavior).
- The auto-created "Expert" thread is a **normal** `ChatThread` — no new `role` field, no filtering, no badge. It appears in the chat-threads list, can be chatted in, renamed, deleted (which clears `activeExpertThreadId`), and switched to on the chat side. The only thing distinguishing it is the pointer.
- The chat side (`activeChatThreadId`, `+` flow, MCP `create_chat_thread` inheritance, `new-thread-prefill`) is unchanged.

## Capabilities

### New Capabilities

- `session-expert-thread`: Optional expert-mode agent+model inputs at session creation, auto-creation of the expert thread when the agent is reachable, and the `activeExpertThreadId` pointer that expert mode binds to.

### Modified Capabilities

- `expert-mode`: R4 (Thread Binding) changes — expert mode reads the active expert thread (`activeExpertThreadId`) instead of the active chat thread.
- `chat-threads`: adds the `activeExpertThreadId` pointer as a persisted field on the session, independent from `activeChatThreadId`.
- `session-management`: the "User can create a session" requirement gains optional expert agent+model inputs and the auto-create-expert-thread step.

## Impact

- **mimo-platform UI** — `SessionCreatePage.tsx` gains an optional agent + model form-group (populated from online agents' cached capabilities); form parsing in `sessions.tsx` and the `apiClient.post("/sessions", ...)` body gain the new fields.
- **mimo-platform internal API** — `CreateSessionRequest` (`api/rest/sessions/types.ts`) and `CreateSessionInput` (`domain/sessions/repository.ts`) gain optional `expertAgentId` / `expertModelId` / `expertModeId`. `createSessionHandler` (`api/rest/sessions/handlers.ts`) auto-creates the "Expert" thread after `repos.sessions.create` when the agent is online, and sets `activeExpertThreadId`.
- **mimo-platform domain** — `Session` and `SessionData` (`domain/sessions/repository.ts`) gain `activeExpertThreadId: string | null`; `create()` initializes it to `null`; `setActiveExpertThread` mutator added alongside `setActiveChatThread`.
- **mimo-platform expert-mode UI** — `public/js/edit-buffer.js` `getActiveThreadId()` (`:220-229`) reads `activeExpertThreadId` (via the session state exposed to the page) instead of `window.MIMO_CHAT_THREADS.getActiveThreadId()`.
- **mimo-agent** — no change. ACP bootstrap already happens per-thread on first use (`src/index.ts:379-399`); the auto-created "Expert" thread follows the same lazy-spawn path as any thread created via the REST API.
- **Spec deltas** — `expert-mode` R4 modified; `chat-threads` gains an "Active expert thread is persisted" requirement; `session-management` gains an expert-defaults scenario.
- **No breaking changes** — all additions are optional. Sessions created without the expert inputs behave exactly as today.