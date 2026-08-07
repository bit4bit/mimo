## Why

The CommitBuffer has a destructive Force Push button (overwrite remote with local) but no inverse: when the remote branch has advanced or been rewritten and the platform/agent mirrors have diverged, the only way to recover is manual terminal work. Users need a one-click "Pull Force" that pulls the latest remote state and hard-aligns both the platform mirror and the agent workspace to it, discarding all local commits and changes. This mirrors the Force Push pattern, with an added confirmation step listing the affected repositories.

## What Changes

- Add a "Pull Force" button inside the CommitBuffer footer, positioned to the left of the existing Force Push button
- The button pulls the latest changes from the remote branch and hard-resets **both** the platform upstream mirror (`upstreamPath`) and the agent workspace (`agentWorkspacePath`) to remote HEAD, discarding all local commits and uncommitted changes (including untracked files)
- Requires confirmation before acting: a native `confirm()` dialog listing every affected repository when "All repositories" is selected, or the single selected repo otherwise
- Respects the repository selector: when a specific repo is selected, only that repo is pulled; when "All repositories" is selected, the operation fans out across every repo in the session (server-side), returning per-repo results
- After a successful pull force, the session's per-repo baseline is updated to the new remote HEAD so the commit preview reflects the reset rather than showing every file as changed
- Git only: Fossil repositories are skipped with an explicit "not supported" per-repo result (no silent failure). The `replace-fossil-with-git` change is already in progress.
- Fix the existing Force Push so "All repositories" actually applies to all repos: today it silently only force-pushes `session.repos[0]`. Force Push gains the same server-side fan-out pattern used by `commitAndPushAcrossRepos` and returns per-repo results via `renderRepoResults`.

## Capabilities

### New Capabilities
- `pull-force`: destructive pull-and-reset of the platform mirror and agent workspace to remote HEAD, with confirmation and multi-repo fan-out

### Modified Capabilities
- `commit-buffer`: adds Pull Force button alongside Sync Now / Force Push; fixes Force Push "All repositories" fan-out

## Impact

- **Frontend component**: `CommitBuffer.tsx` adds the `pull-force-btn` button (left of Force Push) with `data-help-id`
- **Frontend script**: `commit-buffer.js` adds `pullForce()` (confirmation + per-repo result rendering) and fixes `forcePush()` to fan out across repos when "All" is selected
- **Backend routes**: `commits.ts` adds `POST /commits/:sessionId/pull-force` (mirrors `push-force`) and makes `push-force` honor "All repositories"
- **Commit service**: `service.ts` adds `pullForceAcrossRepos()` / `pullForce()`; fixes `forcePush()` to fan out; both update per-repo baselines where applicable
- **VCS layer**: `vcs/index.ts` adds `pullForce()` (git: `fetch` + `reset --hard` + `clean -fd`); fossil returns a "not supported" result
- **Session model**: per-repo baseline updates via existing `persistRepoBaseline`
- **Testing**: unit tests for the new endpoint, service fan-out, VCS `pullForce`, Force Push fan-out regression, and frontend `pullForce`/confirmation behavior