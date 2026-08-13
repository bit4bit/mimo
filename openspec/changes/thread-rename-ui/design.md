## Context

The backend fully supports thread renaming: `SessionRepository.updateChatThread(sessionId, threadId, { name })` enforces per-session uniqueness (established by the `thread-name-uniqueness` change), and `PATCH /sessions/:id/chat-threads/:threadId` is wired in the REST layer. The frontend `updateThread(threadId, updates)` function in `chat-threads.js` already calls this endpoint. What's missing is a UI entry point, error surfacing, cross-client sync, and secondary UI refresh (summary selects, context bar).

Thread tabs are rendered in `updateThreadTabsUI()` (`chat-threads.js`) as `<button>` elements with a single `click` → `switchToThread()` handler. The WS message handler in `chat.js` already has a pattern for thread lifecycle events (`chat_thread_created`).

## Goals / Non-Goals

**Goals:**

- Add inline rename via double-click on any thread tab
- Surface rename errors (duplicate, server rejection) inline on the edit input
- Sync renames across open browser tabs via WebSocket
- Keep summary-buffer selects and context bar in sync after rename
- Bound thread name length to prevent layout breakage

**Non-Goals:**

- Renaming via a modal dialog or context menu (inline edit only)
- Renaming from the context bar (the tab is the sole entry point)
- Case-insensitive uniqueness (case-sensitive, as established by `thread-name-uniqueness`)
- Trimming whitespace before comparison (compare as-is, per existing design)
- Auto-renaming or name suggestions

## Decisions

### Double-click on tab triggers inline edit

**Rationale**: Matches the universal IDE/browser-tab pattern users already know. Single-click still switches threads (fires immediately, harmless no-op if already active). Double-click on any tab — active or not — enters edit mode. No new HTML elements needed; tabs are JS-generated in `updateThreadTabsUI()`.

**Alternative considered**: Pencil icon on the context bar — but this only renames the active thread (requires switch-then-rename, two steps). Right-click context menu — fiddly on touch devices and heavier to implement. Modal dialog — inconsistent with the lightweight tab interaction model.

### Replace tab `<button>` text `<span>` with an `<input>` during edit

The tab is a `<button>` containing a status-indicator `<span>` and the name text. During edit, the name text portion is replaced with an `<input type="text">`. The status indicator stays visible. The input inherits the tab's font styling. On commit or cancel, `updateThreadTabsUI()` re-renders the tab to restore the normal `<span>` display.

**Alternative considered**: Replacing the entire `<button>` with an `<input>` — but this loses the status indicator and requires more DOM surgery. Keeping the `<button>` as container and swapping only the name child is simpler.

### `updateThread()` must report success/failure to caller

Currently `updateThread()` catches errors and returns `null` (caller can't distinguish success from failure). The inline edit needs to know whether the rename succeeded to decide whether to accept the new name or revert. Change `updateThread()` to re-throw on error (or return a result object), so the inline-edit handler can catch and show inline error feedback.

**Chosen approach**: Return `null` on error but attach the error message to the returned value via a thrown error. The inline-edit caller wraps in try/catch. Existing callers that don't catch are unaffected (they already handle `null` return).

### Client-side pre-validation for instant feedback

Before sending the PATCH, check against `ChatThreadsState.threads`:
- Empty or whitespace-only name → cancel edit, no request
- Name unchanged from current → no-op, cancel edit
- Name matches another thread (excluding self) → show inline error, stay in edit mode, no request

The server uniqueness check remains the source of truth (race conditions, other tabs). Server 400 is still handled and surfaces the same inline error.

### WebSocket broadcast: `chat_thread_renamed`

After a successful rename in `updateChatThreadHandler` (`handlers.ts`), broadcast `{ type: "chat_thread_renamed", sessionId, threadId, name }` to all session WS subscribers. This mirrors the existing `chat_thread_created` broadcast pattern in `server.ts:367`.

Frontend handler in `chat.js` WS switch:
- Update `ChatThreadsState.threads[idx].name`
- Call `updateThreadTabsUI()` to re-render tabs
- If renamed thread is active, call `updateThreadContextUI()` to update context bar
- Call `updateSummaryBufferSelects()` to refresh dropdowns

**Alternative considered**: Full `MIMO_CHAT_THREADS.refresh()` (refetch all threads via REST) — heavier and causes a visible flash. Targeted update from the WS message payload is cleaner.

### `maxlength=60` on name inputs

Applied to both the inline edit `<input>` and the create dialog name `<input>`. 60 characters is generous for a tab label while preventing layout breakage in the fixed-height tab strip. The backend has no length limit today; this is a client-side guard only.

## Risks / Trade-offs

- [Risk] Single-click switches thread before double-click edit engages, so double-clicking a non-active tab switches to it AND enters edit mode → Mitigation: This is acceptable and even useful (switch + rename in one gesture). The switch is immediate; the edit overlay appears after.

- [Risk] `updateThread()` currently used by model/mode/brainWash change handlers which don't handle thrown errors → Mitigation: Only the rename path needs error handling. Change `updateThread()` to throw on error; existing callers that ignore the return value are unaffected since they don't await/catch. Alternatively, keep `updateThread()` as-is and add a separate `renameThread()` wrapper — but this duplicates the PATCH call logic. Prefer modifying `updateThread()` to throw and auditing existing callers.

- [Risk] Client-side duplicate check uses local `ChatThreadsState.threads` which may be stale if another tab renamed a thread → Mitigation: Server-side check is the authority and catches true collisions. Client-side is best-effort for UX responsiveness only.

- [Risk] `maxlength` is client-side only; programmatic thread creation (MCP, API) has no length limit → Mitigation: Acceptable — programmatic names are agent-generated and short. Adding a backend length limit is out of scope but could be a follow-up.