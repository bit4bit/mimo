## 1. New Component

- [x] 1.1 Create `ProjectsSessionsPage.tsx` with split-pane layout (left: project list, right: empty or selected project)
- [x] 1.2 Left panel: render project rows with name (link → `?selected=:id`), edit icon (→ `/projects/:id/edit`), impact icon (→ `/projects/:id/impacts`); highlight selected row
- [x] 1.3 Right panel (no selection): render empty state
- [x] 1.4 Right panel (project selected): render metadata header (repo type, repo URL, branch, credential name) + edit/impact icons + `[+ New Session]` button
- [x] 1.5 Right panel (project selected): render sessions DataTable with search, sorted by priority then recency, with status/priority/expiry/actions columns matching current `SessionListPage`
- [x] 1.6 Session row actions (close, delete) post to existing endpoints; confirm dialogs match current behavior

## 2. Route Updates

- [x] 2.1 Update `GET /projects` handler in `projects/routes.tsx` to accept `?selected=:projectId` query param, load selected project + its sessions, pass all to `ProjectsSessionsPage`
- [x] 2.2 Update `GET /projects/:id` handler to redirect to `/projects?selected=:id` (302)
- [x] 2.3 Update `GET /projects/:projectId/sessions/:id` handler: set `backUrl` to `/projects?selected=:projectId` in Layout props
- [x] 2.4 Update session delete redirect (`POST /:id/delete`) to `/projects?selected=:projectId` instead of `/projects/:projectId/sessions`

## 3. Cleanup

- [x] 3.1 Delete `ProjectsListPage.tsx`
- [x] 3.2 Delete `ProjectDetailPage.tsx`
- [x] 3.3 Delete `SessionListPage.tsx`
- [x] 3.4 Remove unused imports of deleted components from `projects/routes.tsx` and `sessions/routes.tsx`

## 4. Tests

- [x] 4.1 Write tests for `GET /projects` with no `selected` param — renders unified page, no sessions
- [x] 4.2 Write tests for `GET /projects?selected=:id` — renders unified page with correct project and sessions
- [x] 4.3 Write tests for `GET /projects/:id` — returns 302 redirect to `/projects?selected=:id`
- [x] 4.4 Write tests for session detail `backUrl` — equals `/projects?selected=:projectId`
- [x] 4.5 Write tests for session delete redirect — redirects to `/projects?selected=:projectId`
