## 1. Domain: pinned-sessions store

- [x] 1.1 Define `PinnedSessionsRepository` interface (list, add, remove, reorder) and in-memory type for ordered `{sessionId, projectId}` entries
- [x] 1.2 Implement filesystem-backed `PinnedSessionsRepository` reading/writing `~/.mimo/users/<username>/pinned-sessions.yaml`
- [x] 1.3 Enforce the cap of 5 entries in `add` (reject with `pin_limit_reached` error)
- [x] 1.4 Implement move-to-front on duplicate add in `add`
- [x] 1.5 Unit tests: empty list, add, cap rejection, move-to-front, remove, reorder, persist-across-instances

## 2. API: pin CRUD endpoints

- [x] 2.1 Create `src/api/rest/users/pinned-sessions-handlers.ts` (or extend `users/` folder) with `GET /api/internal/users/:userId/pinned-sessions`
- [x] 2.2 Add `POST .../pinned-sessions` (insert/move-to-front, enforce cap)
- [x] 2.3 Add `DELETE .../pinned-sessions/:sessionId`
- [x] 2.4 Add `PUT .../pinned-sessions` (reorder by `{order: [sessionId,...]}`)
- [x] 2.5 Resolve each entry to `{sessionId, projectId, sessionTitle, branch}` at GET time; tolerate stale entries (omit or flag missing)
- [x] 2.6 Wire handlers into the internal-api router with auth middleware (401 on unauthenticated)
- [x] 2.7 Integration tests for each endpoint including cap, stale-entry, and auth cases

## 3. Web: embed-mode on the session page

- [x] 3.1 Thread an `embed` boolean prop through `SessionDetailPage` from the `?embed=1` query flag (server-side parse in the session route handler)
- [x] 3.2 Introduce an `EmbedLayout` (or branch in `Layout.tsx`) that omits top-nav, footer actions bar, and shortcuts bar when `embed` is true
- [x] 3.3 Default the right frame to collapsed on initial render when `embed` is true and no persisted frame-state preference exists
- [x] 3.4 Suppress the pin checkbox and `[≡]` button when `embed` is true
- [x] 3.5 Verify all buffers (chat, edit, file-tree, notes, mcp, summary, threads, plan, patch) remain functional under embed mode
- [x] 3.6 Tests: embed flag suppresses chrome; non-embed rendering unchanged; right frame collapses by default
- [x] 3.7 In embed mode, filter the right frame to only Files, Impact, and Notes buffers (hide Summary, MCP, Plan); left-frame buffers unchanged
- [x] 3.8 Tests: `?embed=1` right frame renders file-tree, impact, notes tabs and omits summary, mcp-servers, plan tabs; non-embed page still renders all right-frame tabs

## 4. Web: pin checkbox in the session page top-nav

- [x] 4.1 Add a `pinSlot` (or equivalent) prop to `Layout.tsx` so `SessionDetailPage` can render a pin checkbox next to `sessionName | ⎇ branch`
- [x] 4.2 Render the pin checkbox with `checked` state sourced from a server-provided `isPinned` flag on the session page
- [x] 4.3 Client JS: on toggle, `POST` or `DELETE` to the pin endpoint and update checkbox state; handle cap-reached error with a transient inline message
- [x] 4.4 Tests: checkbox reflects pinned state on load; toggle calls correct endpoint; cap error surfaced

## 5. Web: pinned-sessions drawer

- [x] 5.1 Create `PinnedSessionsDrawer` component (overlay drawer anchored left) with an empty-state message
- [x] 5.2 Add the top-left `[≡]` button to `Layout.tsx` (global, authenticated pages only) that opens the drawer
- [x] 5.3 On open, drawer fetches `GET /api/internal/users/:userId/pinned-sessions` and renders each entry with title + branch
- [x] 5.4 Clicking an entry (title/branch, not its checkbox) navigates to `/projects/:projectId/sessions/:sessionId` and closes the drawer
- [x] 5.5 Render stale entries as "session no longer exists" with an unpin action
- [x] 5.6 Close drawer on Escape and on outside-click
- [x] 5.7 Add a per-entry selection checkbox (default checked) to each drawer entry; toggling records state without affecting pin-store membership
- [x] 5.8 Rename the parallel action to "View selected in parallel" and show the count of checked entries; navigate to `/pinned?ids=<sessionId,...>` carrying only the checked session ids
- [x] 5.9 Tests: checkbox toggle updates the parallel action label/count; clicking the parallel action with K checked entries navigates to `/pinned?ids=<sid1,...,sidK>`; unchecked entries are excluded

## 6. Web: `/pinned` parallel view

- [x] 6.1 Add a `/pinned` route handler that loads the user's pin list and renders `PinnedParallelPage`
- [x] 6.2 `PinnedParallelPage` renders one column per pinned session, each containing `<iframe src="/projects/:pid/sessions/:sid?embed=1">`
- [x] 6.3 Render an empty-state page ("Pin a session first") when the pin list is empty
- [x] 6.4 Render placeholder columns with an unpin action for stale pin entries
- [x] 6.5 Implement active-column focus tracking: listen to `focus`/`blur` on each iframe, toggle a highlight class on the column wrapper
- [x] 6.6 Tests: N columns rendered with correct iframe srcs; empty state; stale placeholder; focus highlight toggles
- [x] 6.6a Render the `[≡]` side-menu button on the `/pinned` parallel view (both columns view and empty state) so the drawer is reachable without leaving `/pinned`
- [x] 6.6b Tests: `/pinned` response contains `id="pinned-menu-btn"` and the drawer shell (`id="pinned-drawer-root"`) and the drawer client script
- [x] 6.7 Filter the `/pinned` page to render only the session ids passed via the `?ids=` query param (in that order); render an empty-state "Select at least one session to view in parallel" when `?ids=` is empty or all ids are unchecked
- [x] 6.8 Tests: `/pinned?ids=sid1,sid2` renders exactly two columns in that order and omits other pinned sessions; `/pinned?ids=` (empty) renders the selection-required empty state

## 7. Wiring, polish, and verification

- [x] 7.1 Confirm no CSP/X-Frame-Options header is added that would block same-origin iframes (or add `frame-ancestors 'self'` if hardening is desired)
- [x] 7.2 Verify auth cookies flow into same-origin iframes without additional config
- [x] 7.3 Add help-tooltip entries (`data-help-id`) for the pin checkbox, `[≡]` button, "View selected in parallel" action, and active-column indicator
- [x] 7.4 Manual smoke: pin 5 sessions, toggle selection checkboxes, open `/pinned?ids=...`, confirm only the checked sessions load as iframes, the `[≡]` button reopens the drawer from `/pinned`, each iframe's right frame shows only Files/Impact/Notes, focus indicator works, and each iframe's chat/edit/file-tree operate independently
- [x] 7.5 Update orientation/help system (`orientation-help-system` change) if it references the top-nav layout
- [x] 7.6 Run `bun test` and `bun run test.full` in both `mimo-platform` and `mimo-agent` packages