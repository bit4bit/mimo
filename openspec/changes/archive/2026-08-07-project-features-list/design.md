## Context

Projects are file-backed: `ProjectRepository` stores `<projectsPath>/<id>/project.yaml`; project notes live at `<projectsPath>/<id>/notes.txt` via `FrameStateService`. There is no per-project planned-work concept. The projects view (`ProjectsSessionsPage.tsx`) shows a left project list and a right sessions pane; session creation is a server-rendered form at `GET /projects/:projectId/sessions/new` with no query-param prefill today.

## Goals / Non-Goals

**Goals:**
- Per-project feature list with add / edit / delete / done-toggle.
- Features tab in the projects view right pane, switchable with Sessions.
- "Create session" button per feature → session creation form with `branchName` prefilled and feature description placed into session notes.

**Non-Goals:**
- No branch-name validation (the existing form slugifies on submit; prefill is verbatim).
- No feature→session linking/tracking after creation.
- No rich-text descriptions — plain text only.
- No reordering, priorities, or due dates.

## Decisions

### 1. Storage: `<projectsPath>/<projectId>/features.json`

Mirror the project-notes pattern (file next to `project.yaml`), not a DB table — the platform has no DB. JSON (not YAML) because the payload is a simple flat array and `JSON.parse`/`stringify` needs no dependency:

```json
[{ "id": "uuid", "branchName": "dark-mode", "description": "...", "done": false, "createdAt": "..." }]
```

Missing file → empty list. Writes are atomic-ish via write-to-temp-then-rename, consistent with repo conventions elsewhere.

*Alternative considered:* extend `project.yaml` — rejected; it mixes frequently-mutated list data with rarely-changing project config and complicates `ProjectRepository`'s model.

### 2. Domain: new `FeatureRepository` in `src/domain/features/`

Injected via context/services like other repositories (no singletons, per `llms/core-engineering.md`). Mirrors `pinned-sessions` structure: domain repo + internal API router + web feature folder.

### 3. API: internal REST + web JSON endpoints, mirroring project notes

- Internal: `GET/POST /api/internal/projects/:id/features`, `PUT/DELETE /api/internal/projects/:id/features/:featureId` (pattern: `api/rest/projects.ts:48` `:id/sessions` sub-resource).
- Web routes: `/projects/:id/features` JSON endpoints consumed by a `public/js/features.js` browser script (pattern: `public/js/notes.js` + `pages/projects.tsx:544-582`).

### 4. UI: tab switch in `ProjectsSessionsPage.tsx` right pane

The right pane header gains `Sessions | Features` tabs. Active tab is driven by a `?tab=features` query param (consistent with existing `?selected=` param usage) so the page stays server-rendered and links are shareable. The Features tab renders the list server-side; add/edit/delete/done go through the web JSON endpoints with a small `features.js`, then reload.

*Alternative considered:* a dedicated `/projects/:id/features` page like `ImpactHistoryPage` — rejected; the user explicitly wants an in-pane tab switch with Sessions.

### 5. Session prefill: query params on `GET /projects/:projectId/sessions/new`

The route reads `?branchName=` and `?notes=` and passes them into `SessionCreatePage.tsx`, which uses them as the `value`/`textarea` content defaults (falling back to current behavior when absent). After session creation, the notes value is written to the session notes (`sessions/<id>/notes.txt`) as plain text. The feature's "Create session" button is a plain link: `/projects/:id/sessions/new?branchName=<enc>&notes=<enc>`.

*Alternative considered:* POST directly creating the session from the feature — rejected; users still want to review/adjust agent, model, TTL, etc. in the form.

## Risks / Trade-offs

- [Concurrent edits to `features.json` from two tabs could clobber each other] → Mitigation: whole-list writes with temp-file rename; feature lists are small and single-user, so last-write-wins is acceptable.
- [Prefilled `notes` param with very long descriptions hits URL length limits] → Mitigation: descriptions are expected to be short; browser URL limits (~8k+) are far beyond typical usage. Documented as a known limit.
- [Branch name prefill may contain characters invalid for branches] → Mitigation: per decision, no validation; the create form already slugifies `branchName` on submit.
