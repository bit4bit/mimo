## Why

The project-management spec already requires that deleting a project removes the project directory **and** terminates any running agents for its sessions (`openspec/specs/project-management/spec.md:73-82`). The current implementation does not honor this:

- `DELETE /api/internal/projects/:id` (`packages/mimo-platform/src/api/rest/projects/handlers.ts:435-464`) only clears the VCS cache and recursively deletes the project directory. It does **not**:
  - revoke MCP tokens for the project's sessions,
  - clear in-memory session / file-sync / impact state,
  - remove the centralized bare git repos under `~/.mimo/session-repos/`,
  - notify connected agents via `session_ended` (so active ACP processes keep running against deleted workspaces),
  - clean up stale pinned-session references for the deleted sessions.
- The web delete route `POST /projects/:id/delete` (`packages/mimo-platform/src/web/features/projects/pages/projects.tsx:357-370`) exists but is unreachable: no page renders a "Delete project" affordance (unlike agents, credentials, repositories, and MCP servers). Users cannot trigger deletion from the UI.
- `DELETE /api/internal/sessions/:id` (`packages/mimo-platform/src/api/rest/sessions/handlers.ts:474-485`) bypasses the canonical `deleteSessionByRecord` use case (`packages/mimo-platform/src/domain/sessions/session-deletion.ts:48-78`), so even single-session delete skips agent notification and token revocation on the internal API path.

A complete, safe project delete must cascade through every session using the shared per-session cleanup use case, disconnect all agents active on those sessions, and surface a confirmed delete action in the UI.

## What Changes

- Introduce a `deleteProjectCascade` use case that, for a given project:
  1. loads the project's sessions,
  2. runs the existing `deleteSessionByRecord` use case for each (revoking MCP tokens, deleting session filesystem + centralized bare git repos, clearing session/file-sync/impact state, and notifying every assigned agent via `session_ended`),
  3. removes stale pinned-session entries for the deleted session ids,
  4. clears the project VCS cache (git + fossil),
  5. deletes the project directory (which also removes `features.json` and the project's `impacts/` directory).
- Wire `DELETE /api/internal/projects/:id` and `POST /projects/:id/delete` through the new cascade use case instead of the bare repository delete.
- Route `DELETE /api/internal/sessions/:id` through `deleteSessionByRecord` so the internal API matches the web/sweeper paths (consistency, no cleanup drift).
- Add a confirmed "Delete project" action to the web UI: a button on `ProjectEditPage` (danger zone) that shows a confirmation dialog before `POST /projects/:id/delete`.
- Expose active-agent / session-count context on the project edit page so the user sees what will be torn down before confirming.

## Capabilities

### New Capabilities

- `project-cascade-delete`: A project delete cascades through every owned session using the shared session-deletion use case (token revocation, filesystem + centralized VCS repo removal, in-memory state cleanup, agent `session_ended` notification), removes stale pinned-session references, then clears the project VCS cache and removes the project directory.

### Modified Capabilities

- `project-management`: `DELETE /api/internal/projects/:id` and `POST /projects/:id/delete` now invoke the cascade-delete use case; `ProjectEditPage` gains a confirmed "Delete project" danger-zone action.
- `session-management`: `DELETE /api/internal/sessions/:id` now routes through the shared `deleteSessionByRecord` use case instead of the bare repository delete, so token revocation, state cleanup, and agent notification parity hold on every delete path.

## Impact

- `packages/mimo-platform/src/domain/projects/project-deletion.ts` — new cascade-delete use case factory (mirrors `sessions/session-deletion.ts`).
- `packages/mimo-platform/src/api/rest/projects/handlers.ts` — `deleteProjectHandler` invokes the cascade use case.
- `packages/mimo-platform/src/api/rest/sessions/handlers.ts` — `deleteSessionHandler` invokes `deleteSessionByRecord`.
- `packages/mimo-platform/src/web/features/projects/pages/projects.tsx` — `POST /projects/:id/delete` unchanged route shape (still proxies internal API); pass session/active-agent counts to the edit page.
- `packages/mimo-platform/src/web/features/projects/components/ProjectEditPage.tsx` — add "Delete project" danger-zone section with confirmation dialog.
- `packages/mimo-platform/src/infrastructure/context/mimo-context.ts` — construct and expose the cascade-delete use case (inject sessions repo, session-deletion use case, pinned-sessions repo, project VCS cache, projects repo).
- `packages/mimo-platform/test/` — behavior tests for cascade delete (sessions + agents + pins + features + VCS cache), internal session-delete parity, and UI confirmation gating.