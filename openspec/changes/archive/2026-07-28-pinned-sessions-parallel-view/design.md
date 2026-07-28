## Context

The session page (`SessionDetailPage.tsx`) renders a two-frame buffer layout under a shared `Layout.tsx` top-nav. Users jump between sessions via the `SessionFinderDialog` (Ctrl+Shift+3), which searches *all* sessions each time. There is no notion of a curated, persistent subset of "sessions I care about right now." Each session page boots a heavy JS stack (chat, edit, file-tree, threads, keybindings) and opens its own WebSocket; the server already supports many concurrent WS clients and gracefully idles file watchers after disconnect (`api/websocket/handlers.ts`).

The platform uses semantic versioning and a layered architecture (domain → infrastructure → api → web). REST handlers live under `src/api/rest/<feature>/handlers.ts`; internal-API handlers under `/api/internal/...`. User data today lives under `~/.mimo/users/<username>/` (credentials, config). There is no existing iframe usage and no CSP/X-Frame-Options set in `mimo-server.ts`, so same-origin iframes work without policy changes.

## Goals / Non-Goals

**Goals:**
- Per-user, cross-project pinning of up to ~5 sessions, ordered.
- One-click pin/unpin of the current session from the top-nav.
- A global side-menu drawer (top-left `[≡]`) listing pinned sessions by title + branch with per-entry selection checkboxes (default checked); clicking an entry's title jumps to that session's full page, while the "View selected in parallel" action opens `/pinned` with only the checked entries.
- A `/pinned` parallel view rendering each **selected** pinned session in its own embedded iframe, laid out as horizontal columns.
- An embed mode (`?embed=1`) that trims top-nav, footer, and shortcuts bar and defaults the right frame to collapsed, so each iframe is usable at narrow widths.
- A visual active-column indicator so the user knows which iframe holds keyboard focus.

**Non-Goals:**
- Resizable / draggable columns in `/pinned` (v2).
- Cross-iframe coordination (e.g., shared clipboard, unified command palette) — each iframe remains a full, independent session page.
- A "live status strip" alternative (monitoring without interaction) — out of scope; the user explicitly wants to jump in and interact.
- Pin sharing between users — pins are strictly personal.
- Mobile/responsive tuning of the parallel view — desktop-first.

## Decisions

### D1: Pin store as a per-user file, not a DB table

Pins are ordered, capped at ~5, and purely personal. A new file `~/.mimo/users/<username>/pinned-sessions.yaml` (or extension of the existing user config blob) stores an ordered list of `{sessionId, projectId}` entries. No schema migration, no DB.

**Alternative considered:** a `user_pinned_sessions` table — rejected because the project doesn't use a relational DB and the pin set is tiny and personal.

### D2: Side-menu button in `Layout.tsx`, not `SessionDetailPage`

The `[≡]` button lives in the global `Layout.tsx` top-nav so it's visible on every authenticated page (dashboard, projects, sessions). The drawer itself is a new `PinnedSessionsDrawer` component rendered once by `Layout`. Pin checkbox, by contrast, only renders on session pages — `Layout` exposes a slot/prop (`pinSlot`) that `SessionDetailPage` fills.

### D3: Dedicated `/pinned` route for the parallel view

A new top-level route renders `PinnedParallelPage`, which loads the user's pins and emits one `<iframe src="/projects/:pid/sessions/:sid?embed=1">` per **selected** pin. Selection is made in the drawer via per-entry checkboxes (default checked); the "View selected in parallel" action passes the checked session ids to `/pinned` (via query string) so the page renders only those columns. Route-level (rather than in-page swap) because:
- Bookmarkable, back-button works.
- Avoids tearing down the current session page's heavy JS.
- Each iframe cleanly boots its own session page.

**Alternative considered:** in-page swap to a parallel layout — rejected for the teardown complexity above.

### D4: Embed mode via URL flag, not a separate page

`SessionDetailPage` reads an `embed` prop (sourced from `?embed=1`). When true:
- `Layout` renders without top-nav, footer-actions wrapper, and shortcuts bar (or `Layout` is bypassed entirely for an `EmbedLayout`).
- Right frame defaults to collapsed (reuse the existing `right-frame-collapse-toggle` mechanism / `frameState`).
- The pin checkbox and `[≡]` button are suppressed (no nesting).
- **Right-frame buffers are filtered to Files, Impact, and Notes only.** Summary, MCP, and Plan are omitted because the parallel view is narrow (≈288px per column at the 5-column cap) and those buffers are either redundant at that width (Summary repeats chat content) or rarely needed side-by-side (MCP, Plan). The left-frame buffers (Chat, Terminal, Edit, Patches, Commit) stay available so the user can still drive the session. The filter is applied at render time in `SessionDetailPage` by filtering `getBuffersForFrame("right")` to the embed allow-list; the registry itself is unchanged so non-embed pages keep the full set.

**Alternative considered:** a separate `EmbedSessionPage` component — rejected to avoid duplicating the buffer/frame wiring; one flag is cheaper.

### D5: Active-column indicator via iframe focus polling

The parent `/pinned` page tracks which iframe last received focus by listening to `focus`/`blur` events on each iframe element (same-origin → can attach listeners) and applies a highlight class to the focused column's wrapper. No `postMessage` needed for v1.

### D5b: Side-menu button visible on `/pinned`

`PinnedParallelPage` previously passed `showPinnedMenuButton={false}` to `Layout`, hiding the `[≡]` button on the parallel view. The user wants the side menu reachable from `/pinned` so they can re-open the drawer to add or remove pins without leaving the parallel view. `PinnedParallelPage` now renders the `[≡]` button (the default `showPinnedMenuButton` behavior) on both the columns view and the empty-state view. The drawer shell and its client script are already rendered by `Layout` on every non-embed authenticated page, so no new wiring is needed — only the flag flip. The embed-mode suppression in D4 is unaffected because `/pinned` itself is not rendered in embed mode (only its iframes are).

### D6: Pin CRUD via internal API

New handlers under `src/api/rest/users/` (or a new `pinned-sessions` subfolder):
- `GET /api/internal/users/:userId/pinned-sessions` → ordered list with title + branch + project resolved.
- `POST /api/internal/users/:userId/pinned-sessions` body `{sessionId, projectId}` → append (or move to top), enforce cap.
- `DELETE /api/internal/users/:userId/pinned-sessions/:sessionId` → remove.
- `PUT /api/internal/users/:userId/pinned-sessions` body `{order: [sessionId,...]}` → reorder.

The drawer and the pin checkbox both talk to these endpoints; the drawer re-renders from the GET response.

## Risks / Trade-offs

- **5 iframes = 5 WebSockets + 5 file watchers per viewer.** Accepted at the cap. Server WS layer already handles multi-session clients; watcher idle lifecycle already drains on disconnect. Document the cap (~5) as a hard UI limit, not just a guideline.
- **Column width.** 5 columns on 1440px ≈ 288px each. Chat input + message list are cramped but usable. Resizable columns deferred (Non-Goal).
- **Keyboard confusion.** Same-origin iframes isolate keybindings to the focused iframe, so there are no actual conflicts — but users need a visual cue. The active-column indicator (D5) is the mitigation; without it the feature is unusable.
- **Embed-mode drift.** A single `embed` flag on `SessionDetailPage` must be respected by every chrome element (top-nav, footer, shortcuts bar, pin slot, `[≡]`) and now also by the right-frame buffer filter. Missing one leaks chrome or a non-essential buffer into iframes. Mitigation: a single `EmbedLayout` wrapper that simply doesn't render those elements and a single allow-list (`["file-tree", "impact", "notes"]`) that filters `getBuffersForFrame("right")` in one place, rather than sprinkling conditionals.
- **Stale pin references.** A pinned session may be deleted by another client. The drawer and `/pinned` page must tolerate missing sessions (skip with a "session no longer exists" row, offer unpin). The pin store is best-effort; reads resolve sessions at render time.
- **Auth in iframes.** Same-origin iframes share cookies, so JWT auth just works. No cross-origin concerns. Documented for future maintainers.

## Open Questions

- **Pin cap enforcement:** hard block at 5, or soft warn-and-drop-oldest? Proposal says hard cap; confirm during implementation.
- **Ordering semantics:** does pinning an already-pinned session move it to the top, or no-op? Leaning move-to-top (most-recently-pinned-first). Confirm.
- **Empty `/pinned` state:** redirect to dashboard with a toast, or render an empty page with a "Pin a session first" CTA? Leaning the latter.