## Why

Users working across several active sessions have no fast way to recall the handful they care about right now. The session finder searches *all* sessions every time; browser tabs lose project/branch context and don't scale. A persistent, curated shelf of pinned sessions — with a one-click parallel view — lets a user jump straight to the work that matters and observe all of it side by side.

## What Changes

- Add a per-user, cross-project **pin store** for sessions (ordered list, cap ~5).
- Add a **pin checkbox** to the session page top-nav next to the session name/branch, letting the user pin or unpin the current session.
- Add a global **top-left side-menu button** (`[≡]`) in the layout that opens a drawer listing pinned sessions (title + branch). Clicking an entry navigates to that session's full page.
- Add a **"View selected in parallel"** action in the side menu that routes to a new `/pinned` page rendering one iframe per **selected** pinned session (drawer checkboxes let the user pick which pins to view side-by-side), laid out as horizontal columns.
- Add an **embed mode** (`?embed=1`) for the session page that suppresses top-nav, footer, and shortcuts bar, defaults the right frame to collapsed, and filters the right frame to only the Files, Impact, and Notes buffers (Summary, MCP, and Plan are hidden in embed mode) — so each iframe is usable at narrow widths.
- Add a visual **active-column indicator** in the parallel view so the user can tell which iframe currently has keyboard focus.
- Render the **`[≡]` side-menu button** on the `/pinned` parallel view so the user can reopen the drawer without leaving the parallel view.

## Capabilities

### New Capabilities
- `pinned-sessions`: Per-user pinning of sessions, the side-menu drawer (with per-entry selection checkboxes) listing them, and the `/pinned` parallel view rendering each **selected** pinned session in its own embedded iframe.

### Modified Capabilities
- `session-management`: Session page gains an embed mode (URL flag) that suppresses layout chrome, defaults the right frame to collapsed, and filters the right frame to the Files/Impact/Notes buffers only.
- `user-auth`: User profile/settings gain storage for the ordered list of pinned session ids.

## Impact

- **Frontend**: `Layout.tsx` (top-left menu button, pin checkbox slot), `SessionDetailPage.tsx` (embed-mode rendering, pin checkbox wiring, right-frame buffer filter for embed mode), `PinnedParallelPage.tsx` (side-menu button enabled), new `PinnedSessionsDrawer` component, new `/pinned` route + page component, new embed-aware rendering branch, new client JS for drawer/parallel-view interactions and active-column focus tracking.
- **Backend**: New REST endpoints for pin CRUD (`GET/POST/DELETE /api/internal/users/:userId/pinned-sessions`, ordering via `PUT`), user-pins persistence (table or user-config blob), `/pinned` route handler, embed-mode flag propagation into `SessionDetailPage` props.
- **Existing routes**: `SessionFinderDialog` and session search are unaffected; pinned drawer is additive.
- **Performance**: Up to ~5 simultaneous iframes → ~5 WebSockets + ~5 file watchers per viewer. Server already supports multi-session WS; watcher idle lifecycle (`api/websocket/handlers.ts`) handles disconnect gracefully. Documented as an accepted cost at the capped pin limit.
- **Keyboard**: Same-origin iframes isolate keybindings to the focused iframe; no cross-iframe conflict, but active-column indicator is required for usability.