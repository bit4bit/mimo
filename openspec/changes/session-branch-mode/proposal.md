## Why

Today, the session creation form accepts an optional branch name, and the handler always clones the project's default `sourceBranch` and then runs `git checkout -B <branchName>` locally. That works when the branch is new, but there is no way to start a session that resumes work already pushed to an existing remote branch — for example continuing a teammate's PR branch or a user's own branch from another machine.

Users need to declare intent at session-creation time:
1. **Sync existing branch** — the branch already lives on the remote; clone it directly and push back to it.
2. **Create new branch** — the branch does not exist yet; current behavior.

## What Changes

- Add a `branchMode` radio group ("Create new branch" / "Sync existing branch") to the new-session form, adjacent to the existing Branch input. Default: `new`.
- Parse `branchMode` in `POST /projects/:projectId/sessions`. When omitted, treat as `new` for back-compat.
- In `sync` mode: clone the specified branch directly (pass as `sourceBranch` to `vcs.cloneRepository`), skip `vcs.createBranch`, still persist `session.branch = branchName` so the existing push path works.
- In `new` mode: preserve existing behavior (clone project `sourceBranch`, then `createBranch`).
- Validation: `sync` mode requires a non-empty `branchName` and is rejected (400) for fossil projects in this iteration.
- Error surface: a sync clone of a non-existent remote branch returns 500 with the underlying VCS error ("Remote branch ... not found in upstream origin"), and the partially-created session is deleted — matches the existing clone-failure path.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-bootstrap`: Session creation accepts a branch mode that switches between cloning an existing remote branch and creating a new local branch from the project default.

## Impact

- **UI**: `SessionCreatePage` gains a `branchMode` radio group. No other form fields change.
- **Routes**: `POST /projects/:projectId/sessions` parses `branchMode`, validates, and branches the clone/createBranch path.
- **VCS layer**: No changes — `cloneRepository` already accepts `sourceBranch`.
- **Commit/push flow**: No changes — `commits/service.ts` already pushes to `session.branch`, which is set in both modes.
- **Data model**: No changes. `branchMode` is not persisted on the session; the resolved `session.branch` is the only durable state.
- **Back-compat**: Omitting `branchMode` defaults to `new`, so existing clients and tests continue to work.
- **Scope limitation**: Fossil repositories are rejected for sync mode in this iteration (backend 400). Adding fossil sync is out of scope.
