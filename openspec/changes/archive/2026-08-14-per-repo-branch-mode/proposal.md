## Why

Session creation supports a branch mode (`new` vs `sync`) — but only as a single session-level choice applied to every repository. In multi-repo sessions, users routinely need mixed strategies: create a fresh feature branch in the main repo while syncing an existing branch (e.g. `main`, a release branch, or a teammate's PR branch) in a secondary repo. Today that combination is impossible without creating multiple sessions.

## What Changes

- Replace the single session-level Branch field + `branchMode` radio group in the new-session form with a **per-repository branch card** for every repository in the project (cards always, including single-repo projects).
- Each card carries its own mode radio (`branchMode_<repoId>` = `new` | `sync`) and branch input (`branchName_<repoId>`).
- `POST /projects/:projectId/sessions` resolves mode and branch name **per repository** inside the existing per-repo clone loop; the resolved branch is persisted per repo (`SessionRepositoryEntry.branch`). Mode remains non-persisted.
- Validation becomes per-repo: sync mode with an empty branch name → HTTP 400 naming the repository; sync mode on a fossil repository → HTTP 400 naming the repository (fossil sync remains out of scope).
- Sync failure error messages name the failing repository; the existing delete-session-on-failure behavior is unchanged.
- Back-compat: flat `branchName` / `branchMode` fields (no `_<repoId>` suffix) are still accepted and apply to all repositories, so existing clients and `?branchName=` prefill links keep working.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `session-bootstrap`: The branch-mode requirement changes from a single session-level selection to per-repository selection with per-repo resolution, validation, and error attribution, plus a back-compat fallback for flat fields.

## Impact

- **UI**: `packages/mimo-platform/src/web/features/sessions/components/SessionCreatePage.tsx` — the session-level Branch form-group is replaced by per-repo cards (pattern mirrors `RepositoryPicker`). The page's `Project` interface widens to include per-repo `repoType` and `newBranch`. The auto-slugify script fans out to per-repo "new branch" inputs and stops auto-filling an input once its card switches to sync mode.
- **Routes**: `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx` — POST parses per-repo fields with flat-field fallback; per-repo validation; the existing per-repo clone loop (≈ lines 669–744) switches from session-level `branchMode`/`branchName` variables to loop-local resolved values.
- **Internal API / domain**: No schema change required. `SessionRepoMountInput.branch` and `SessionRepositoryEntry.branch` already exist per repo; the web route continues to resolve modes itself and does not persist `branchMode`.
- **VCS layer**: No changes — `cloneRepository(sourceBranch)` and `createBranch` already support both modes.
- **Commit/push flow**: No changes — `commits/service.ts` already prefers per-repo `sessionRepo.branch`.
- **Agent**: No changes — the agent receives only the resolved per-repo branch.
- **Back-compat**: Flat `branchName`/`branchMode` posts and `?branchName=` prefill behave as today (applied to all repos, default mode `new`).
- **Scope limitation**: Fossil sync remains rejected (HTTP 400), now evaluated per repository.
