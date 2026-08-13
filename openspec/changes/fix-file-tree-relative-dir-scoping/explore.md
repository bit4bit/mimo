# Explore: File explorer breaks when Workspace directory changes

## Summary

When a user sets the **"Workspace directory (optional)"** field (`relativeDir`) during session creation, the file explorer (FileTree buffer) stops working — it either shows an empty tree or returns paths that cannot be opened. The file explorer should show the **entire session workspace** (all mounted repositories at their mount paths) and must not be affected by the agent's starting directory.

## Reproduction

1. Create a project with one or more repositories.
2. Create a session and set "Workspace directory (optional)" to a subdirectory (e.g. `packages/backend`).
3. Open the session → the Files buffer (file tree) is empty or broken.
4. Files listed (if any) have paths relative to the subdirectory, but the content endpoint (`/files/content`) resolves them against the unscoped workspace root → "File not found" on click.

## Root Cause

The file-tree endpoints scope the repository workspace paths by the session's `relativeDir` before listing files:

### `scopeReposByRelativeDir()` — `sessions.tsx:194-250`

```
const sub = (session.relativeDir ?? session.agentSubpath ?? "").trim();
```

When `sub` is non-empty, the matched repository's `workspacePath` is rewritten to `os.path.join(repo.workspacePath, sub)`. This narrows the file listing to the subdirectory only.

### Affected endpoints

| Endpoint | Location | Scopes by relativeDir? |
|---|---|---|
| `GET /sessions/:id/files` | `sessions.tsx:1607` | **Yes** — `scopeReposByRelativeDir(session, os)` |
| `GET /sessions/:id/changed-files` | `sessions.tsx:1667` | **Yes** — `scopeReposByRelativeDir(session, os)` |
| `GET /sessions/:id/files/content` | `sessions.tsx:3313-3316` | **No** — uses unscoped `session.repos[].workspacePath` |

### Two distinct problems

1. **File list is scoped to the subdirectory.** If `relativeDir` points to a subdirectory that doesn't exist on disk (common during explore before checkout), `listFiles` returns `[]` (`service.ts:213: if (!os.fs.exists(workspacePath)) return []`) and the tree is empty. Even when the subdirectory exists, only files inside it are listed — the user cannot browse the rest of the workspace.

2. **Path mismatch between list and content.** The `/files` endpoint returns paths relative to the scoped subdir, but `/files/content` resolves the same path against the unscoped workspace root. So even when files appear, clicking them fails with 404.

### Why this is wrong

The `relativeDir` / `agentSubpath` concept was designed to control **only the agent's ACP process working directory** (see `session-agent-subpath/spec.md`):

> "When set, the agent's ACP process SHALL be initialized with that subdirectory as its working directory."

The agent-side cwd resolution in `mimo-agent/src/index.ts:881-888` already handles this independently:

```
const effectiveSubpath = threadConfig?.relativeDir ?? sessionInfo.agentSubpath;
// ACP cwd = os.path.join(sessionInfo.checkoutPath, effectiveSubpath)
```

The file explorer is a **session-level UI** (right-frame buffer) that should show the complete workspace. The `scopeReposByRelativeDir` helper was added during the `multi-repo-projects` change with the comment: *"so the FileTree and changed-file detection reflect what the agent actually sees."* This coupling is the bug — the file tree should reflect what's in the workspace, not what's in the agent's cwd.

## Data Flow

```
User sets relativeDir on session create form
  → POST /projects/:id/sessions (sessions.tsx:530-547)
    → effectiveRelativeDir = relativeDir ?? agentSubpath
    → stored on session.relativeDir
  → session_ready sent to agent (message-router.ts:451-455)
    → agent sets ACP cwd (mimo-agent/index.ts:414-417) ✓ correct

User opens Files buffer
  → file-tree.js fetches GET /sessions/:id/files
    → sessions.tsx:1607: scopeReposByRelativeDir(session, os) ✗ incorrect coupling
      → repo.workspacePath = join(workspacePath, relativeDir)
      → fileService.listFiles(scopedPath) → empty or subdirectory-only
```

## Proposed Fix Direction

The file-tree endpoints (`/files` and `/changed-files`) should **not** call `scopeReposByRelativeDir`. They should list files and detect changes from the unscoped `session.repos[].workspacePath` (the full mounted repository), so the file explorer always shows the complete workspace regardless of the agent's starting directory.

The `relativeDir`/`agentSubpath` should only affect the agent's ACP cwd, which is already handled separately in `mimo-agent/src/index.ts`.

The `resolveAgentCwd()` helper at `sessions.tsx:176` (which uses only `agentSubpath`) is the intended agent-cwd resolver and is distinct from the file-tree scoping — it should remain.

### Files to change

- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx`
  - `GET /:id/files` (line 1607): remove `scopeReposByRelativeDir` call, use `session.repos` directly
  - `GET /:id/changed-files` (line 1667): remove `scopeReposByRelativeDir` call, use `session.repos` directly
  - `scopeReposByRelativeDir()` (line 194): remove if no longer used elsewhere

### Tests to write (BDD — failing first)

1. **File tree lists all repos when relativeDir is set** — create a session with `relativeDir` set to a subdirectory; verify `GET /sessions/:id/files` returns files from the full workspace (not just the subdirectory).
2. **Changed-files detects changes across full workspace when relativeDir is set** — create a session with `relativeDir`; verify `GET /sessions/:id/changed-files` detects changes outside the subdirectory.
3. **File content resolves correctly when relativeDir is set** — verify `GET /sessions/:id/files/content` can read a file that the file tree lists (path consistency).

### Existing test to update

- `changed-files-route.test.ts:270` — "scopes both upstream and workspace paths to session.agentSubpath when set" — this test asserts the scoping behavior that we are removing. It should be updated to assert that changed-files detection runs against the **unscoped** workspace path even when `agentSubpath` is set.

## References

- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx:194-250` — `scopeReposByRelativeDir()`
- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx:1607` — `/files` scoping
- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx:1667` — `/changed-files` scoping
- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx:3313-3316` — `/files/content` (unscoped, inconsistent)
- `packages/mimo-platform/src/domain/files/service.ts:212-213` — `listFiles` returns `[]` if path missing
- `packages/mimo-agent/src/index.ts:414-417, 881-888` — agent cwd resolution (correct, separate)
- `openspec/specs/session-agent-subpath/spec.md` — spec: agentSubpath affects only ACP cwd
- `openspec/changes/multi-repo-projects/design.md:73-77` — Decision 4: `relativeDir` introduced
- `packages/mimo-platform/public/js/file-tree.js:381` — frontend fetches `/sessions/:id/files` (session-scoped only)
- `packages/mimo-platform/test/multi-repo-files-routes.test.ts` — existing file-route tests
- `packages/mimo-platform/test/changed-files-route.test.ts:270` — existing scoping test (to update)