## Why

Projects accumulate planned work ("add OAuth", "dark mode") that today lives nowhere in the platform. Users need a lightweight per-project feature list where each feature is a `branchName` + plain-text description, and a one-click path from a feature to a new session with the branch name prefilled and the description carried into the session notes.

## What Changes

- Add a per-project **Features** list: create, edit, delete, and a `done` checkbox per feature.
- Add a **Features tab** in the projects view right pane, switchable with the existing **Sessions** view (`ProjectsSessionsPage`).
- Each feature has a **"Create session"** button that navigates to the session creation form for that project with `branchName` prefilled and the feature description placed into the session notes.
- Session creation form/route accepts `branchName` and `notes` query params for prefill (no validation of branch name — the form already slugifies on submit; prefill is verbatim).
- Features are persisted per project as a file alongside `project.yaml` / `notes.txt` (e.g. `features.json`).

## Capabilities

### New Capabilities

- `project-features-list`: Per-project feature list — CRUD of features (`branchName`, plain-text `description`, `done` flag), Features tab in the projects view, and create-session hand-off that prefills branch name and session notes.

### Modified Capabilities

- `session-management`: Session creation accepts `branchName` and `notes` query parameters to prefill the form.
- `unified-projects-sessions-view`: The projects view right pane gains a Sessions/Features tab switch.

## Impact

- **Domain**: new file-backed feature repository under `packages/mimo-platform/src/domain/` (pattern: `ProjectRepository`, `FrameStateService` notes handling).
- **API**: new internal REST sub-resource under `/api/internal/projects/:id/features`; web JSON endpoints mirroring `/projects/:id/notes`.
- **Web UI**: `ProjectsSessionsPage.tsx` (tab switch), new features components + `public/js` client script, `SessionCreatePage.tsx` + `GET /projects/:projectId/sessions/new` route for prefill params.
- **Storage layout**: adds `<projectsPath>/<projectId>/features.json` (backwards compatible; missing file = empty list).
