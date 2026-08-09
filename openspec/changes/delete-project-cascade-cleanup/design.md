## Context

Deleting a project must tear down everything tied to it: sessions, their agent connections, pinned references, VCS caches, and on-disk data. The repository already has a canonical per-session cleanup recipe — `createSessionDeletionUseCase` (`packages/mimo-platform/src/domain/sessions/session-deletion.ts:48-78`) — shared by the web session-delete route and the TTL sweeper. It performs, in order: MCP token revocation, session filesystem delete (incl. centralized bare git repo under `~/.mimo/session-repos/`), in-memory session-state clear, file-sync cleanup, impact-state clear, and `session_ended` notification to every assigned agent (session-level + per-thread).

The project delete path does not use it. `deleteProjectHandler` (`packages/mimo-platform/src/api/rest/projects/handlers.ts:435-464`) only clears the project VCS cache and calls `ProjectRepository.delete(id)`, which recursively removes `<projectsPath>/<projectId>/`. That removes session YAML + `upstream/` + `agent-workspace/` dirs (they live under the project dir), plus `features.json` and `impacts/`, but it leaves:

- centralized bare git repos at `~/.mimo/session-repos/<sessionId>[-repoId].git`,
- live MCP tokens,
- in-memory session / file-sync / impact state,
- running ACP processes on connected agents (no `session_ended` sent),
- stale pinned-session entries in `~/.mimo/users/<username>/pinned-sessions.yaml`.

There is also no UI entry point: `POST /projects/:id/delete` exists but no page links to it. And the internal `DELETE /sessions/:id` handler bypasses the shared use case entirely, so the internal API path is already inconsistent with the web/sweeper paths.

## Goals / Non-Goals

**Goals:**

- A single project delete cascades through every owned session using the existing `deleteSessionByRecord` use case — no cleanup drift.
- Active agents on the project's sessions receive `session_ended` and tear down their ACP processes.
- Stale pinned-session references are removed.
- Project VCS cache (git + fossil) and the project directory are removed.
- A confirmed "Delete project" affordance exists in the UI.
- The internal `DELETE /sessions/:id` route shares the same cleanup path as the web route and the sweeper.

**Non-Goals:**

- Deleting agents themselves (agents are user-owned resources that may serve other projects' sessions).
- Deleting credentials, MCP servers, or repositories referenced by the project.
- Hard-cancelling in-flight prompts (consistent with existing `session_ended` semantics — in-flight prompts are not cancelled, per `llms/acp-architecture.md` and the agent-sharing spec).
- Bulk/project-list delete.
- Soft-delete / trash / undo.

## Decisions

### D1 — Reuse `deleteSessionByRecord` per session, do not shortcut the project dir delete

**Decision**

The cascade use case iterates the project's sessions and calls `deleteSessionByRecord(session)` for each, then clears the VCS cache and deletes the project directory.

**Rationale**

`deleteSessionByRecord` is the single source of truth for session cleanup (token, filesystem, centralized bare git repo, in-memory state, file-sync, impact, agent notification). Reusing it guarantees parity with the manual and TTL-sweeper paths and avoids duplicating the cleanup recipe (DRY). Deleting the project directory afterward is still required to remove `project.yaml`, `features.json`, and the project's `impacts/` dir; the per-session delete has already removed each session dir, so the recursive project delete only removes non-session artifacts — safe and idempotent.

### D2 — New `createProjectDeletionUseCase` factory, injected deps

**Decision**

Add `packages/mimo-platform/src/domain/projects/project-deletion.ts` exporting `createProjectDeletionUseCase(deps)` with a `deleteProjectCascade(project: { id, owner })` method. Deps interface:

- `sessions: { listByProject(projectId): Promise<Session[]> }`
- `sessionDeletion: SessionDeletionLike` (the existing use case)
- `pinnedSessions: { remove(username, sessionId): Promise<void> }`
- `projectVcsCache: { clear(projectId, repoType, repoId?): Promise<void> }`
- `projects: { delete(id): Promise<void> }`

Construct it in `mimo-context.ts` alongside the session-deletion use case and expose it on the context (e.g. `useCases.projectDeletion`).

**Rationale**

Mirrors the `session-deletion.ts` pattern: a factory with explicit, injected dependencies (no singletons, no hidden globals — per `llms/core-engineering.md`). Keeping it in the domain layer keeps the REST handler thin and testable. The context is the system boundary where concrete repos/services are wired; the use case itself stays pure.

### D3 — Iterate sessions then pinned refs; clean per-owner pins only

**Decision**

After deleting each session via `deleteSessionByRecord`, call `pinnedSessions.remove(project.owner, sessionId)` for each deleted session id. Do not iterate all users.

**Rationale**

Pinned-session entries are stored per-user. The project owner is the only user who could have pinned that project's sessions (sessions are owner-scoped — `listByOwner` filtering is applied everywhere). Iterating all users would be wasteful and would require a `listAll` that does not exist on the pinned-sessions repo. Scoping to the owner matches the existing authorization model and is sufficient. (If a shared-agent scenario ever allows pinning another owner's session, that is a separate change; current specs do not support it.)

### D4 — Fail-safe ordering: sessions first, cache + dir last

**Decision**

Order: (1) delete each session (filesystem + centralized repo + state + agent notify + token revoke), (2) remove pinned refs, (3) clear VCS cache, (4) delete project dir. Per-session and per-step try/catch with logging, continuing on non-fatal errors for session cleanup so one corrupt session does not block the whole project delete.

**Rationale**

Agent notification and token revocation must happen before the filesystem disappears so connected agents receive `session_ended` cleanly. Clearing the VCS cache after session delete avoids clearing a cache a still-running session might rely on (sessions are gone by then). The project dir delete is last because it is the most destructive and least recoverable. Error isolation mirrors the TTL sweeper's per-session try/catch (`session-retention-sweeper.ts`).

### D5 — Route internal `DELETE /sessions/:id` through `deleteSessionByRecord`

**Decision**

Change `deleteSessionHandler` (`packages/mimo-platform/src/api/rest/sessions/handlers.ts:474-485`) to construct/lookup the session-deletion use case (already on `mimoContext`) and call `deleteSessionByRecord(session)` instead of `repos.sessions.delete(...)`.

**Rationale**

Today the internal API path skips token revocation, state cleanup, and agent notification — a latent bug. Routing through the shared use case makes all three delete paths (web, internal API, sweeper) identical. This is in scope because the project cascade depends on the use case being the canonical path, and leaving a divergent internal path invites future drift.

### D6 — UI: confirmed delete on `ProjectEditPage`, danger zone

**Decision**

Add a "Danger Zone" section to `ProjectEditPage` (`packages/mimo-platform/src/web/features/projects/components/ProjectEditPage.tsx`) containing a "Delete project" button. The button opens a native `confirm()` dialog stating the project name and the number of sessions/active agents that will be removed; on confirm it submits `POST /projects/:id/delete`. The web route shape (`projects.tsx:357-370`) is unchanged — it still proxies to the internal API, which now runs the cascade.

Pass session count and active-agent count into the edit page view model from the project detail/edit route (server-side: `sessions.listByProject` + filter agents online via `mimoContext.services.agents.isAgentOnline` for each `assignedAgentId`).

**Rationale**

A confirmation step is required by the existing spec scenario ("confirms deletion"). Putting it on the edit page (not the detail page) groups destructive actions away from the primary view and matches the pattern used by agents/credentials/MCP servers. Showing what will be torn down sets user expectations and reduces accidental deletes.

### D7 — No new spec capability for session-delete parity

**Decision**

Document the internal-session-delete parity fix as a `## MODIFIED Requirements` update to `session-management`, not a new capability.

**Rationale**

It closes an existing implementation gap against an already-specified requirement ("User can delete a session" → "terminates agent process if running"). It is not a new behavior, just making the internal API honor the spec.

## Risks / Trade-offs

| Risk | Mitigation |
| --- | --- |
| Long-running agent does not ack `session_ended` before the project dir is removed | `notifySessionEnded` is fire-and-forget over the WS; the agent tears down its local ACP clients asynchronously. Acceptable — the platform-side session record and workspaces are gone regardless, and the agent's `session_ended` handler already clears its local state. |
| A session fails to delete partway (e.g. corrupt YAML) and blocks project delete | Per-session try/catch continues the loop; the project dir delete still runs and removes residual files. Logged for follow-up. |
| Stale pins for a session whose owner differs from the project owner | Not possible today (sessions are owner-scoped); scoped to owner per D3. Revisit if cross-owner pinning is ever added. |
| Internal `DELETE /sessions/:id` behavior change for API consumers | New behavior strictly adds cleanup the spec already required; no response-shape change. |
| User deletes a project with many sessions — slow | Cascade is sequential and bounded by session count; acceptable for a manual, rare, destructive action. No background job needed. |

## Migration Plan

1. Add `project-deletion.ts` use case + deps interface.
2. Wire it into `mimo-context.ts` (construct after session-deletion use case; inject it).
3. Switch `deleteProjectHandler` to call the use case.
4. Switch `deleteSessionHandler` to call `deleteSessionByRecord`.
5. Add the danger-zone UI + confirmation on `ProjectEditPage`; pass counts from the edit route.
6. Add behavior tests (see `tasks.md`); run `bun test` in `packages/mimo-platform`.
7. No on-disk migration — existing projects/sessions are untouched until a delete is invoked.