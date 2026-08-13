## Why

The session creation form exposes two near-identical fields — "Agent working directory" (`agentSubpath`, repo-relative) and "Workspace directory" (`relativeDir`, workspace-relative) — that confuse users because they overlap heavily, fall back to each other, and use different coordinate systems. Users cannot tell which to fill, and for single-repo projects they are functionally the same. Collapsing them into one clear field removes the confusion while preserving the workspace-relative generality needed by multi-repo projects.

## What Changes

- **BREAKING** Replace the two form inputs ("Agent working directory" and "Workspace directory") on the session creation form with a single "Working directory" input that is workspace-relative.
- The single field accepts a workspace-relative path. For single-repo projects, the workspace root equals the repo root, so existing repo-relative values (`packages/backend`) work unchanged. For multi-repo projects, the path may include a repository mount path (`repo-a/packages/app`).
- The backend SHALL resolve the single form value into the existing `agentSubpath` and `relativeDir` storage fields internally — no storage migration is required.
- The project-level `agentSubpath` default is surfaced as the pre-filled value of the single field (unchanged behavior, single field).
- The session settings (read-only) page SHALL show one "Working directory" row instead of two.
- The project create form keeps its single "Agent Working Directory" field (already unified) — no change there.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `session-agent-subpath`: The session creation form exposes a single "Working directory" field (workspace-relative) instead of separate `agentSubpath` (repo-relative) and `relativeDir` (workspace-relative) inputs. The backend resolves the single value into both stored fields.
- `project-working-directory`: The project default `agentSubpath` is pre-filled into the single session "Working directory" field, and the resolution chain (session value → project default → repo root) is preserved through the single field.

## Impact

- `packages/mimo-platform/src/web/features/sessions/components/SessionCreatePage.tsx` — collapse two form groups into one; update label, placeholder, and help text.
- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx` — POST handler resolves a single `workingDirectory` form field into `agentSubpath` and `relativeDir`; `resolveAgentCwd` and `scopeReposByRelativeDir` helpers updated accordingly.
- `packages/mimo-platform/src/web/features/sessions/components/SessionSettingsPage.tsx` — show a single read-only "Working directory" row.
- `packages/mimo-platform/test/sessions.test.ts` — update assertions referencing the two separate labels.
- `packages/mimo-platform/test/chat-threads.test.ts` — thread working-directory override tests updated for single field.
- Out of scope: the file-tree scoping bug tracked by `fix-file-tree-relative-dir-scoping` (separate change).