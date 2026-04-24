## Context

The platform is a server-rendered Hono/JSX app with vanilla JS client scripts. Global keybindings are already handled via `session-keybindings.js` and `window.MIMO_GLOBAL_KEYBINDINGS`. The `FileFinderDialog` establishes the existing modal pattern: server-rendered hidden overlay, client JS shows/hides it, fetches data on demand. Layout.tsx renders on every page and is the injection point for global UI.

Sessions are scoped to projects and owners. No cross-project session listing endpoint exists today. The `/:id` route in sessions handles individual sessions; a new `/search` route must be defined before it to avoid shadowing.

## Goals / Non-Goals

**Goals:**
- Keyboard-triggered global session finder available on every page
- Fuzzy (substring) match against session name OR project name
- Recent sessions shown on open (empty query, sorted by last activity)
- Tab cycles highlight through results; Enter navigates to selected session
- Keybinding configurable via YAML (`openSessionFinder`)

**Non-Goals:**
- Ranked/scored fuzzy matching (substring is sufficient)
- Creating or deleting sessions from the finder
- Showing session content preview
- Pagination of results

## Decisions

### D1: Fetch-on-demand vs. embedded data

**Decision:** Fetch via `GET /sessions/search?q=` on dialog open and on each keystroke (debounced 200ms).

**Rationale:** Embedding all session data in every page response bloats HTML for users with many sessions. On-demand fetch keeps page load lean and always returns fresh data. Latency is acceptable for a deliberate keyboard action.

**Alternatives considered:** Pre-embed `window.MIMO_SESSIONS` at page render — simpler JS but stale data and large payload for users with many sessions.

### D2: Search endpoint location

**Decision:** `GET /sessions/search` added to the sessions router, defined before `/:id`.

**Rationale:** Hono matches routes in declaration order; placing `/search` first avoids collision with `/:id`. Logically belongs in the sessions domain. No new router needed.

**Alternatives considered:** `/projects/sessions/search` — adds path complexity without benefit.

### D3: "Recent sessions" for empty query

**Decision:** Return up to 10 sessions sorted by `lastActivityAt` descending (fallback to `createdAt`). No query filtering applied.

**Rationale:** Shows the user their most relevant sessions immediately on open without typing. Limit of 10 keeps the dropdown manageable.

### D4: Client script — new file vs. extend existing

**Decision:** New `session-finder.js` loaded on every page (not session-scoped).

**Rationale:** File finder (`session-keybindings.js`) is session-scoped (only loaded when `sessionId` is set). Session finder must work on all pages including `/projects`, `/dashboard`. Separate file keeps concerns isolated.

### D5: Tab behavior

**Decision:** Tab cycles highlight forward through results (Shift+Tab cycles backward). Does not autocomplete the input.

**Rationale:** Picker-style navigation is familiar (VS Code command palette, fzf). Autocomplete-to-input would be confusing when matching project names.

### D6: "Open session" action

**Decision:** Navigate via `window.open(url, "session-{id}")` — same target as the session name link in `ProjectsSessionsPage`.

**Rationale:** Consistent with existing session link behavior. Re-uses any already-open tab for that session.

## Risks / Trade-offs

- [Auth bypass risk] `/sessions/search` returns data across projects — must enforce `owner === username` filter. → Mitigation: reuse existing auth middleware pattern; filter by owner in query.
- [Empty state flicker] Dialog opens, then async fetch populates results. → Mitigation: show "Loading..." skeleton while fetching, same as `FileFinderDialog`.
- [Route collision] `/sessions/search` vs `/:id` if route order changes. → Mitigation: document order dependency; add comment in routes file.

## Migration Plan

No schema changes. No data migrations. New endpoint and client files only — fully additive. Rollback: remove the three new files and revert `Layout.tsx`, `config/service.ts`, `session-keybindings.js`.

## Open Questions

- None — all decisions resolved in exploration session.
