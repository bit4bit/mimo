## 1. Domain: Feature Repository

- [x] 1.1 Write failing tests for `FeatureRepository` (add/list/edit/delete/toggle done, missing file → empty list, per-project isolation) in `packages/mimo-platform/src/domain/features/repository.test.ts`
- [x] 1.2 Implement `FeatureRepository` in `packages/mimo-platform/src/domain/features/repository.ts` storing `<projectsPath>/<projectId>/features.json` with temp-file-then-rename writes; verify tests pass
- [x] 1.3 Wire `FeatureRepository` into the services/context container (explicit injection, no singletons)

## 2. Internal REST API

- [x] 2.1 Write failing tests for feature endpoints (`GET/POST /api/internal/projects/:id/features`, `PUT/DELETE /api/internal/projects/:id/features/:featureId`) following `api/rest/projects/projects.test.ts` patterns
- [x] 2.2 Implement features router (handlers + types) and mount it in `createInternalApiRouter`; verify tests pass

## 3. Web JSON Endpoints + Client Script

- [x] 3.1 Write failing tests for web routes `GET/POST /projects/:id/features`, `PUT/DELETE /projects/:id/features/:featureId` (JSON, mirroring the `/projects/:id/notes` endpoints in `pages/projects.tsx:544-582`)
- [x] 3.2 Implement the web routes using the internal API client; verify tests pass
- [x] 3.3 Add `public/js/features.js` for add/edit/delete/done interactions (pattern: `public/js/notes.js`)

## 4. Projects View: Features Tab

- [x] 4.1 Add Sessions/Features tab switch to `ProjectsSessionsPage.tsx` right pane, driven by `?tab=` query param (default Sessions)
- [x] 4.2 Render the feature list server-side in the Features tab (branchName, description, done checkbox, edit/delete actions, "Create session" link per feature, add-feature form)
- [x] 4.3 Style the tab switch and feature list consistent with existing page styles

## 5. Session Creation Prefill

- [x] 5.1 Write failing tests for `GET /projects/:projectId/sessions/new` with `?branchName=` and `?notes=` (form prefilled) and for `POST /projects/:projectId/sessions` writing `notes` to the new session's notes
- [x] 5.2 Update the sessions `new` route to read prefill query params and pass them to `SessionCreatePage.tsx`; verify tests pass
- [x] 5.3 Update `SessionCreatePage.tsx` to use prefill values as field defaults without changing existing defaults when params are absent
- [x] 5.4 Update the `POST /projects/:projectId/sessions` handler to persist provided notes to `sessions/<id>/notes.txt` as plain text

## 6. Verification

- [x] 6.1 Run `bun test` in `packages/mimo-platform`; all tests pass
- [x] 6.2 Run lint/typecheck commands for `packages/mimo-platform`; no errors
- [x] 6.3 Manual smoke: add/edit/delete/toggle a feature, switch tabs, click "Create session", confirm branch name prefilled and notes land in the new session's notes
