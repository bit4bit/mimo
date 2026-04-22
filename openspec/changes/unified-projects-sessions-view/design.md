## Context

Currently three separate pages handle project/session browsing:
- `ProjectsListPage` at `GET /projects` — project list only
- `ProjectDetailPage` at `GET /projects/:id` — project metadata + embedded sessions
- `SessionListPage` at `GET /projects/:id/sessions` — full sessions table

Users must navigate across these pages to work with sessions. The goal is to collapse them into a single split-pane page.

The stack is Hono + server-rendered JSX. No client-side framework, no HTMX. JS is only used for session detail interactions (chat, file viewer, etc.).

## Goals / Non-Goals

**Goals:**
- Single page at `/projects` combines project list (left) and session list (right)
- Project selection via query param: `GET /projects?selected=:projectId`
- Right panel shows project summary + sessions when a project is selected; empty otherwise
- Edit (✎) and impact history (📊) icons per project row — no inline expansion needed
- Session detail back button targets `/projects?selected=:projectId`
- Full page reload on project click (no JS required)

**Non-Goals:**
- Infinite scroll or pagination of projects (DataTable already handles this)
- Inline project editing within the unified page
- Cross-project session view (AllSessionsPage at `/sessions` unchanged)
- Mobile/responsive layout changes
- Any changes to session detail, session create, or project create/edit pages

## Decisions

### D1: Query param for project selection, full page reload

`GET /projects?selected=:projectId` — the server renders the full page with the correct project and sessions pre-loaded. No JS fetch, no partial updates.

**Alternatives considered:**
- JS fetch to `/projects/:id/sessions` → inject into DOM: snappier but adds JS complexity for a non-session page. Unjustified.
- HTMX: not in the stack, adds a dependency.

**Chosen because:** consistent with the existing server-render approach; no new patterns introduced.

### D2: New `ProjectsSessionsPage` component, old components removed

`ProjectsListPage`, `ProjectDetailPage`, and `SessionListPage` are replaced by a single `ProjectsSessionsPage` component. The old files are deleted.

**Alternatives considered:**
- Keep old files, add new page: dead code accumulates.

**Chosen because:** clean cut, no dead code. The old pages have no callers after the route update.

### D3: Right panel layout — metadata header + sessions table

When a project is selected, the right panel renders:
1. Header row: project name + `[✎]` (→ edit) + `[📊]` (→ impacts) + `[+ New Session]` button
2. Metadata line: repo type · repo URL · branch (if set) · credential name (if set)
3. Sessions DataTable with search (reuses existing DataTable component)

Sessions are sorted and rendered identically to the current `SessionListPage` (priority, status, expiry, actions).

### D4: Back URL on session detail

`SessionDetailPage` receives `backUrl` via `Layout`. The route handler at `GET /projects/:projectId/sessions/:id` already computes `backUrl`. Change it from `/projects/:projectId` to `/projects?selected=:projectId`.

### D5: `/projects/:id` route retained for edit/impacts redirects

`GET /projects/:id` currently serves `ProjectDetailPage`. After this change it has no UI purpose. Two options:
- Redirect `GET /projects/:id` → `GET /projects?selected=:id`
- Remove the route

**Chosen:** redirect. External links or bookmarks to `/projects/:id` gracefully land on the unified view with that project selected.

## Risks / Trade-offs

- **`ProjectDetailPage` spec requirement** → `projects/spec.md` has a `ProjectDetailPage` section with MUST requirements. Those requirements are superseded by the new right panel. The spec delta must explicitly REMOVE those requirements to avoid contradiction.
- **Session action redirects** → After close/delete from the right panel, redirects currently go to `SessionListPage`. Must update to `/projects?selected=:projectId`.
- **DataTable search state lost on reload** → Project click causes full reload, clearing any session search text. Acceptable trade-off given the no-JS constraint.

## Migration Plan

1. Add new `ProjectsSessionsPage` component
2. Update `GET /projects` route to render new component (pass all projects + selected project's sessions)
3. Update `GET /projects/:id` route to redirect to `/projects?selected=:id`
4. Update session detail `backUrl` computation in `GET /projects/:projectId/sessions/:id`
5. Update session close/delete redirect targets to `/projects?selected=:projectId`
6. Delete `ProjectsListPage.tsx`, `ProjectDetailPage.tsx`, `SessionListPage.tsx`
7. Update `projects/spec.md` delta to remove `ProjectDetailPage` requirements

No database migrations. No API contract changes. Rollback: revert route handlers and restore deleted components from git.
