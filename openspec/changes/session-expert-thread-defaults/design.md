## Context

Today, sessions start with `chatThreads: []` and `activeChatThreadId: null`. Expert mode binds to the single active chat thread via `window.MIMO_CHAT_THREADS.getActiveThreadId()` (`public/js/edit-buffer.js:220-229`), so the user must click `+` and pick an agent+model before expert mode has anything to talk to. There is no concept of a thread dedicated to expert mode.

This change introduces an independent expert thread pointer (`activeExpertThreadId`) and an optional agent+model input at session creation that, when the agent is reachable, auto-creates a normal chat thread and points the expert pointer at it.

Key existing pieces the design builds on:

- `Session`/`SessionData` (`domain/sessions/repository.ts:39-128`) — owns `chatThreads`, `activeChatThreadId`.
- `addChatThread` (`repository.ts:691-720`) — creates a `ChatThread`, enforces unique name, optionally sets `activeChatThreadId`.
- `addChatThreadHandler` (`api/rest/sessions/handlers.ts:575-675`) — REST endpoint that validates agent usability, resolves instructions, persists the thread, emits `initial_prompt` to the agent.
- `createSessionHandler` (`api/rest/sessions/handlers.ts:257-327`) — the session-creation REST endpoint; calls `repos.sessions.create` then nothing else of relevance here.
- `SessionCreatePage.tsx` (`web/features/sessions/components/SessionCreatePage.tsx`) — the user-facing form.
- The session-creation POST handler (`web/features/sessions/pages/sessions.tsx:282+`) parses form fields and proxies to `POST /sessions` via `apiClient.post`.
- `new-thread-prefill` (`public/js/chat-threads.js:715-723`) — seeds the create-thread dialog from the *active chat* thread when its agent is online.
- mimo-agent per-thread ACP bootstrap (`packages/mimo-agent/src/index.ts:379-399`) — lazy per-thread spawn, keyed by `acpKey(sessionId, chatThreadId)`. No change needed here; the auto-created "Expert" thread follows the same lazy-spawn path as any thread created via REST.

## Goals / Non-Goals

**Goals:**

- Let the user opt into an expert-mode thread at session creation, with one agent+model selection.
- Keep chat and expert thread pointers fully independent.
- Reuse the existing `addChatThread` path so the auto-created thread is indistinguishable from any other thread.
- Degrade gracefully when the chosen agent is offline: silently skip, no error, no pending state.
- Avoid introducing a `role` field or any filtering of the chat-threads list.

**Non-Goals:**

- Persisting the user's *intent* (`expertAgentId`/`expertModelId`) on the session for later retry if the agent was offline at boot. The intent is consumed once at creation time and discarded.
- Auto-creating a chat-side thread at session boot. Chat still starts empty unless the user explicitly opts in (a separate future concern).
- A dedicated UI surface to set/switch `activeExpertThreadId` after session creation beyond the existing thread selector in expert mode's context bar.
- Validating the model/mode against the agent's capabilities at session-creation time. The auto-create path delegates to `addChatThread`/`addChatThreadHandler`, which already validates.

## Decisions

### D1: Store `activeExpertThreadId` on `Session`, persisted in `session.yaml`

**Decision:** Add `activeExpertThreadId: string | null` directly on the `Session` interface and `SessionData` (the on-disk YAML shape), mirroring `activeChatThreadId`. Initialize to `null` in `create()`. Add a `setActiveExpertThread(threadId: string | null)` mutator alongside `setActiveChatThread` (`repository.ts:777-789`).

**Rationale:** `activeChatThreadId` is already persisted this way and the two are conceptually identical (both are "which thread is active on this side"). Keeping the storage shape symmetric avoids special cases and lets the session restore both pointers on page load from the same file.

**Alternatives considered:**

- *Separate `activeExpertThread.yaml` file.* Rejected — adds a file for no benefit and breaks the single-source-of-truth model used by `session.yaml`.
- *Store on `ChatThread` as a flag.* Rejected — a thread doesn't "own" the pointer; the session does. Plus we explicitly decided against a role/flag field.

### D2: Auto-create the "Expert" thread server-side in `createSessionHandler`

**Decision:** After `mimoContext.repos.sessions.create(...)` succeeds, `createSessionHandler` checks the optional `expertAgentId`/`expertModelId`/`expertModeId` inputs. If provided, it looks up the agent and, if the agent is online, calls the existing `addChatThread` repository method (or factors a shared helper out of `addChatThreadHandler` for the validation+create path) with `name: "Expert"`, the provided agent/model/mode, and no `initialPrompt`. It then calls `setActiveExpertThread(newThreadId)`.

**Rationale:** Doing this server-side keeps the auto-create atomic with session creation from the API client's perspective (one `POST /sessions` call). The user-facing POST handler in `sessions.tsx` only needs to forward the new fields; it does not need a second API call. The "agent online" check already exists in `addChatThreadHandler` (`handlers.ts:603-607`); we reuse that logic.

**Agent-offline behavior:** If the agent is offline, the auto-create is skipped silently. The session still succeeds. `activeExpertThreadId` stays `null`. The user's expert inputs are not persisted anywhere for retry — they are simply discarded.

**Alternatives considered:**

- *Auto-create from the UI POST handler in `sessions.tsx` after the session is created.* Rejected — would require a second API call and would be racy with the agent-connect window. Server-side keeps it atomic.
- *Persist `expertAgentId`/`expertModelId` and retry the thread creation when the agent connects.* Rejected — adds pending state, retry machinery, and the user said "just not show anything to select later follow normal flow." Explicitly out of scope (Non-Goals).
- *Fail session creation when the agent is offline.* Rejected — too strict. The session is useful on its own; the expert thread is a convenience.

### D3: Auto-created "Expert" thread is a normal `ChatThread` — no new fields

**Decision:** The auto-created thread uses the existing `addChatThread` input shape (`name`, `model`, `mode`, `assignedAgentId`). No `role` field, no badge, no filtering in the chat-threads buffer. It appears in the list, can be chatted in, renamed, and deleted like any thread.

**Rationale:** Matches the user's explicit decision ("not need the role"). Keeps the chat-threads spec and UI untouched except for the new persisted pointer. Reduces blast radius.

**Consequences:**

- If the user renames the "Expert" thread, `activeExpertThreadId` still points at it (it's keyed by id, not name).
- If the user deletes the "Expert" thread, `removeChatThread` (`repository.ts:762-775`) must also clear `activeExpertThreadId` if it matches — a small addition in that mutator.
- If a thread named "Expert" already exists at session boot (unlikely but possible), `addChatThread`'s uniqueness check (`repository.ts:691-720`) throws. Per the spec scenario, the auto-create is skipped silently in that case. The session still succeeds.

**Alternatives considered:**

- *Reserve the "Expert" name.* Rejected — adds reservation machinery for an edge case the spec already handles (skip silently).

### D4: Expert mode reads `activeExpertThreadId` from session state exposed to the page

**Decision:** `public/js/edit-buffer.js`'s `getActiveThreadId()` (`:220-229`) is changed to read `activeExpertThreadId` from the session state exposed to the page (the same way `MIMO_CHAT_THREADS` exposes `activeChatThreadId`), instead of `window.MIMO_CHAT_THREADS.getActiveThreadId()`. If `activeExpertThreadId` is null, expert mode shows the "Create a chat thread first" state (existing behavior when no thread is active).

**Rationale:** One-line semantic change. The page already has access to session state; we extend the session-state bridge (whichever mechanism `MIMO_CHAT_THREADS` uses) to also expose `activeExpertThreadId`.

**Note on the existing expert-mode thread selector:** `populateThreadSelector` (`edit-buffer.js:296-319`) currently lists all threads. With this change, the selector remains but its purpose shifts: it lets the user pick which existing thread `activeExpertThreadId` should point at (analogous to switching the chat side). We do not filter the list to a subset — any thread can be designated the expert thread. Switching via this selector updates `activeExpertThreadId` (via a new `set_active_expert_thread` WebSocket message or REST call), not `activeChatThreadId`.

**Alternatives considered:**

- *Remove the selector and lock expert mode to the boot thread.* Rejected — too rigid; the user may delete the boot thread and want to point expert at another existing thread without recreating one. Keeping the selector preserves flexibility with minimal extra code.
- *Filter the selector to only the boot-created "Expert" thread.* Rejected — same rigidity problem.

### D5: New optional fields on `CreateSessionRequest` and `CreateSessionInput`

**Decision:** Add `expertAgentId?`, `expertModelId?`, `expertModeId?` to `CreateSessionRequest` (`api/rest/sessions/types.ts:90-102`) and `CreateSessionInput` (`domain/sessions/repository.ts:130-142`). The repository's `create()` does not persist these — they are consumed by `createSessionHandler` for the auto-create step and then discarded. Only `activeExpertThreadId` (set by the auto-create) is persisted on the session.

**Rationale:** Keeps `CreateSessionInput` focused on session-record fields. The expert inputs are an instruction to the handler ("please also create an expert thread with these settings"), not part of the session's persistent shape.

**Alternatives considered:**

- *Persist `expertAgentId`/`expertModelId` on the session for later retry.* Rejected — Non-Goal.

## Risks / Trade-offs

- **[Auto-create fails silently and the user is surprised]** → Mitigation: the expert-mode UI shows the same "Create a chat thread first" state it shows today, which the user already understands. The session-creation form should make clear the expert inputs are best-effort (e.g., a small hint that the agent must be online). Defer the hint to implementation; the spec already guarantees the silent-skip behavior.

- **[Two ACP runtimes spin up if chat also starts a thread]** → This is inherent to the existing multi-thread architecture (`chat-threads` spec R2: "Each chat thread has isolated ACP context"). The auto-created expert thread is just one more thread. The cost is one more ACP process when expert mode is used. Acceptable; lazy-spawn in `mimo-agent` (`src/index.ts:379-399`) means the runtime only starts when the thread is actually used, not at thread-creation time.

- **[`removeChatThread` must clear `activeExpertThreadId` if it matches]** → Small addition in `repository.ts:762-775`. If missed, deleting the expert thread leaves a dangling pointer. Mitigation: covered by a spec scenario ("User deletes the auto-created expert thread") and testable.

- **[The expert-mode thread selector becomes a second source of truth for `activeExpertThreadId`]** → The selector now mutates the expert pointer, not the chat pointer. If a user expects it to switch the chat side too, they'll be surprised. Mitigation: the selector's label in the context bar should make clear it's the expert thread. Defer exact label to implementation.

- **[Thread name "Expert" collision with a user-named thread]** → Spec already specifies silent skip. The user ends up with `activeExpertThreadId: null` and can manually point expert mode at any existing thread via the selector.

## Open Questions

- **Exact surface for `setActiveExpertThread` from the UI.** The expert-mode selector needs a way to update `activeExpertThreadId` on the server. Either a new REST endpoint (`POST /sessions/:id/active-expert-thread` mirroring the existing `setActiveChatThread` endpoint) or a new WebSocket message. Defer to implementation; the spec only requires the pointer be persisted and independently switchable.

- **Whether the existing `setActiveChatThread` endpoint needs a sibling.** Likely yes, but the exact shape (REST vs WebSocket) follows whatever pattern `setActiveChatThread` already uses. Implementation task.

- **Form hint about agent-online requirement.** Spec guarantees silent skip; whether the UI hints at this is a UX decision left to implementation.