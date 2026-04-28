## Why

Navigating between projects and sessions requires multiple page navigations across three separate pages (`/projects`, `/projects/:id`, `/projects/:id/sessions`), creating unnecessary friction. A unified split-pane view eliminates this by showing projects and sessions together on one page.

## What Changes

- **BREAKING**: `/projects` replaces `ProjectsListPage` with a new split-pane `ProjectsSessionsPage`
- **BREAKING**: `ProjectDetailPage` is removed; project metadata folds into the right panel of the unified view
- **BREAKING**: `SessionListPage` is removed; sessions render in the right panel of the unified view
- Project selection via `GET /projects?selected=:projectId` (full page reload, no JS required)
- Left panel: project list, each row has name + edit icon (→ `/projects/:id/edit`) + impact icon (→ `/projects/:id/impacts`)
- Right panel (no selection): empty sessions area
- Right panel (project selected): project metadata summary + sessions list with search + `[+ New Session]` button
- Session detail back button returns to `/projects?selected=:projectId` instead of `/projects/:id`
- `AllSessionsPage` (`/sessions` cross-project view) is unaffected

## Capabilities

### New Capabilities

- `unified-projects-sessions-view`: Single split-pane page combining project list and session list with project-scoped selection

### Modified Capabilities

- `projects`: Project list and detail navigation behavior changes — detail page removed, replaced by right-panel summary
- `session-management`: Back navigation from session detail now targets `/projects?selected=:projectId`

## Impact

- `packages/mimo-platform/src/components/ProjectsListPage.tsx` — replaced
- `packages/mimo-platform/src/components/ProjectDetailPage.tsx` — removed
- `packages/mimo-platform/src/components/SessionListPage.tsx` — removed
- `packages/mimo-platform/src/components/ProjectsSessionsPage.tsx` — new component
- `packages/mimo-platform/src/projects/routes.tsx` — `/projects` GET handler updated
- `packages/mimo-platform/src/components/SessionDetailPage.tsx` — back URL updated
- No API changes, no database changes, no agent protocol changes
