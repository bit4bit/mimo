## 1. Behavior tests first (failing)

- [x] 1.1 Add failing test: deleting a project deletes all its sessions via `deleteSessionByRecord` (filesystem + centralized bare git repo removed for each)
- [x] 1.2 Add failing test: deleting a project revokes the MCP token for each session
- [x] 1.3 Add failing test: deleting a project clears in-memory session/file-sync/impact state for each session
- [x] 1.4 Add failing test: deleting a project sends `session_ended` to every assigned agent (session-level + per-thread)
- [x] 1.5 Add failing test: deleting a project with 0 sessions still removes the project dir and VCS cache
- [x] 1.6 Add failing test: a session that fails to delete during cascade is logged and the loop continues; project dir + cache still removed
- [x] 1.7 Add failing test: deleting a project removes the owner's pinned-session references for its sessions; other projects' pins untouched
- [x] 1.8 Add failing test: deleting a project clears both git and fossil VCS cache and removes the project dir (`project.yaml`, `features.json`, `impacts/`)
- [x] 1.9 Add failing test: `DELETE /api/internal/projects/:id` runs the full cascade and returns `{ success: true }`
- [x] 1.10 Add failing test: non-owner / unauthenticated `DELETE /api/internal/projects/:id` returns 404 / 401 with no deletion
- [x] 1.11 Add failing test: `DELETE /api/internal/sessions/:id` routes through `deleteSessionByRecord` (token revoked, agent notified, state cleared) — internal API parity
- [ ] 1.12 Add failing test: project edit page renders a "Delete project" danger-zone control
- [ ] 1.13 Add failing test: activating "Delete project" shows a confirmation dialog naming the project and counts of sessions/active agents; no request sent until confirmed
- [ ] 1.14 Add failing test: confirming the dialog submits `POST /projects/:id/delete` and redirects to `/projects`

## 2. Project-deletion use case

- [x] 2.1 Create `packages/mimo-platform/src/domain/projects/project-deletion.ts` with `createProjectDeletionUseCase(deps)` and `deleteProjectCascade(project)`; deps: sessions repo (`listByProject`), `SessionDeletionLike`, pinned-sessions repo (`remove`), project VCS cache (`clear`), projects repo (`delete`)
- [x] 2.2 Implement cascade order: per-session `deleteSessionByRecord` (try/catch + log, continue) → `pinnedSessions.remove(owner, sessionId)` per deleted session → `projectVcsCache.clear(id, "git")` + `clear(id, "fossil")` → `projects.delete(id)`
- [x] 2.3 Construct and expose the use case in `packages/mimo-platform/src/infrastructure/context/mimo-context.ts` (inject existing session-deletion use case + repos/services)

## 3. Wire API + web routes

- [x] 3.1 Update `deleteProjectHandler` (`packages/mimo-platform/src/api/rest/projects/handlers.ts`) to call the project-deletion use case instead of bare repo delete
- [x] 3.2 Update `deleteSessionHandler` (`packages/mimo-platform/src/api/rest/sessions/handlers.ts`) to call `deleteSessionByRecord` from `mimoContext` instead of `repos.sessions.delete`
- [x] 3.3 Confirm web route `POST /projects/:id/delete` (`web/features/projects/pages/projects.tsx`) still proxies to the internal API unchanged (shape unchanged)

## 4. UI: confirmed delete on project edit page

- [x] 4.1 Add a "Danger Zone" section to `ProjectEditPage.tsx` with a "Delete project" button
- [x] 4.2 Add a `confirm()` dialog showing project name + session count + active-agent count before submitting `POST /projects/:id/delete`
- [x] 4.3 Pass `sessionCount` and `activeAgentCount` into the edit page view model from the project edit route (server-side: `sessions.listByProject` + `agents.isAgentOnline` for each `assignedAgentId`)
- [x] 4.4 On confirm, submit the form; on cancel, abort (no request)

## 5. Verify

- [ ] 5.1 Run `cd packages/mimo-platform && bun test` — all green
- [x] 5.2 Run targeted project-deletion + session-deletion parity tests and confirm green
- [ ] 5.3 Manually verify (or via integration test) that an active agent receives `session_ended` and tears down its ACP session when its project is deleted