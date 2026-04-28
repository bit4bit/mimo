# Design: Chat Threads with Shared Workspace

## Context

Current behavior couples one session to one active ACP chat context. This works for linear workflows but blocks parallel collaboration patterns such as:

- implementation thread (code mode)
- review thread (review mode)
- architecture thread (explore mode)

At the same time, cloning separate repositories for each chat context is unnecessary and expensive. The session already provides one shared `upstream`, one shared checkout (`agent-workspace`), and one shared `repo.fossil` boundary.

## Goals / Non-Goals

**Goals:**
- Multiple chat threads per session
- One ACP runtime per chat thread
- Shared filesystem and fossil repository for all threads in that session
- Per-thread `model` and `mode`
- Programmatic thread creation and configuration APIs
- Thread-aware reconnect/stream restoration behavior

**Non-Goals:**
- Multi-checkout or branch-per-thread isolation in v1
- Automatic merge/conflict resolution between thread outputs
- Cross-thread shared prompt memory
- Thread-level custom workspace paths

## Decisions

### Decision: Canonical term is `chat-thread`
All user-facing and API-facing names use `chat-thread` / `chatThreadId` to avoid ambiguity with UI-only "buffers".

### Decision: Shared workspace, isolated ACP contexts
Each thread gets its own ACP runtime and ACP session identity, but all runtimes execute in the same checkout path.

**Rationale:** maximizes collaboration and minimizes storage/process overhead from duplicate clones.

### Decision: Per-thread model/mode persistence
Thread metadata includes `model` and `mode`. Switching or updating one thread does not mutate others.

### Decision: Runtime routing key is composite
All runtime state is keyed by `{sessionId, chatThreadId}`.

**Rationale:** session ID alone is no longer unique for ACP runtime state.

### Decision: Default thread on session creation
New sessions create a default thread named `Main`.

**Rationale:** keeps current UX working with no extra required step.

### Decision: Programmatic API is first-class
Thread CRUD is available via HTTP routes, not only UI clicks.

**Rationale:** enables automation and external orchestration of multiple LLM workers.

### Decision: Idle timeout is session-scoped, not thread-scoped
The idle timer is shared across all threads in a session. Any activity on any thread resets the single session-level timer. All threads park together only when no thread has had activity for `idleTimeoutMs`.

**Rationale:** a user working in one thread is actively using the session. Parking a sibling thread mid-session would silently discard its ACP context, which is unexpected and harmful. Parking should signal that the whole session is idle, not just one thread.

## Data Model

Session-level fields:
- `activeChatThreadId: string`

Thread record:
- `id: string`
- `name: string`
- `model: string`
- `mode: string`
- `acpSessionId: string | null`
- `state: "ACTIVE" | "PARKED" | "WAKING"`
- `createdAt: string`

## API

- `GET /sessions/:id/chat-threads`
  - returns all threads and active thread ID
- `POST /sessions/:id/chat-threads`
  - body: `{ name, model, mode }`
  - creates thread and initializes ACP runtime
- `PATCH /sessions/:id/chat-threads/:threadId`
  - body: `{ name?, model?, mode? }`
- `DELETE /sessions/:id/chat-threads/:threadId`
  - closes/parks runtime, removes thread metadata, handles active-thread fallback
- `POST /sessions/:id/chat-threads/:threadId/activate`
  - sets active thread for the session UI

## WebSocket / Message Routing

All chat and stream messages include `chatThreadId`.

Examples:
- user input: `{ type: "user_message", sessionId, chatThreadId, content }`
- stream chunk: `{ type: "message_chunk", sessionId, chatThreadId, chunk }`
- thought chunk: `{ type: "thought_chunk", sessionId, chatThreadId, chunk }`
- usage update / thought end events also include `chatThreadId`

## Lifecycle

1. Create thread
2. Spawn ACP runtime in shared checkout path
3. Initialize ACP session and apply thread `model`/`mode`
4. Route prompts by `chatThreadId`; any inbound prompt records activity on the session-level idle timer
5. On session-level idle timeout (no activity on any thread for `idleTimeoutMs`), park **all** thread runtimes
6. On resume (new prompt arrives for any thread), wake **only** that thread's runtime and restore its `model`/`mode`; other threads remain parked until they receive a prompt

## Risks / Trade-offs

**[Risk]** Two threads can modify overlapping files concurrently
- **Mitigation:** keep VCS truth in shared fossil history; surface conflicts at commit/sync boundaries

**[Risk]** Process count increases with many threads
- **Mitigation:** keep parking enabled with session-level idle timer; all threads park together when the session goes quiet

**[Risk]** Message routing bugs can leak events across threads
- **Mitigation:** require `chatThreadId` in all chat protocol types and integration tests

## Migration Plan

1. Add thread storage and APIs
2. Create default `Main` thread for existing sessions at read-time fallback
3. Update routing protocol to include `chatThreadId`
4. Enable thread tabs in session UI
5. Remove remaining `chatBuffer` terminology from affected surfaces

## Open Questions

1. Should we enforce a maximum threads-per-session in v1?
2. Should deleting a thread also delete its historical messages or archive them?
3. Should model/mode changes apply immediately during an active turn or on next turn only?
