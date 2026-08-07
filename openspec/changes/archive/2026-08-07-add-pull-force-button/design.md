## Context

The CommitBuffer already ships a destructive Force Push (`POST /commits/:sessionId/push-force`) implemented by `CommitService.forcePush()`, which calls `VCS.pushUpstream({ force: true })` on the platform upstream mirror (`upstreamPath`). Two relevant constraints shape this change:

1. **`applyRepoContext` collapses "All repositories" to `session.repos[0]`.** When `repoId` is omitted it selects the first repo, so the existing single-repo Force Push silently only ever acts on one repository when "All" is chosen. The multi-repo fan-out pattern already exists in `CommitService.commitAndPushAcrossRepos()` (`service.ts:711`): it iterates `session.repos`, calls the per-repo operation with `repo.projectRepoId`, and aggregates results. Pull Force and the Force Push fix both reuse this pattern.
2. **No pull-with-overwrite primitive exists.** `VCS.gitPull()` uses `git pull --ff-only` (non-destructive). `VCS.pushUpstream()` pushes. There is no method that fetches remote and discards local state. A new `VCS.pullForce()` is needed.
3. **Two worktrees per repo.** Each session repo has a platform mirror (`sessionRepo.upstreamPath`) and an agent workspace (`sessionRepo.workspacePath`), both git clones of the same remote. Pull Force must reset both to remote HEAD so the platform preview and the agent's working copy agree.
4. **Baseline tracks the last-seen committed state.** `persistRepoBaseline(session, repoId, baseline)` updates the per-repo baseline used by `diffNameStatus` for the commit preview. After a hard reset the baseline must move to the new remote HEAD or the preview would report every file as changed.

Fossil is intentionally unsupported: the `replace-fossil-with-git` change is in progress and the platform is migrating off Fossil. Returning an explicit "not supported" per-repo result (rather than a silent no-op) keeps multi-repo fan-out safe and observable.

## Goals / Non-Goals

**Goals:**
- Add a `VCS.pullForce()` primitive that fetches remote and hard-resets a git worktree (including removal of untracked files).
- Add `POST /commits/:sessionId/pull-force` that fans out across `session.repos` when no `repoId` is given, mirroring `commitAndPushAcrossRepos`.
- Reset **both** `upstreamPath` and `agentWorkspacePath` for each targeted repo and update its baseline.
- Frontend confirmation that lists affected repositories before issuing the request.
- Fix `forcePush()` so "All repositories" fans out across every repo with per-repo results, using the same pattern.

**Non-Goals:**
- Fossil support for pull force (returns "not supported").
- A custom modal component for confirmation — native `confirm()` matches the three existing destructive-action sites (`features.js:84`, `chat-threads.js:1134`, `terminal.js:540`).
- Preserving any local commits or uncommitted changes — Pull Force is explicitly destructive and discards everything.
- Touching the agent's running process state; the agent's next sync reconciles against the reset workspace. (ACP parking/resumption behavior is out of scope — see `llms/acp-architecture.md`.)

## Decisions

### Decision 1: Server-side fan-out, not client-side loop

The frontend issues a single `POST /commits/:sessionId/pull-force` (with or without `repoId`). The service iterates `session.repos` server-side and returns a `MultiRepoResult` array, exactly like `commitAndPushAcrossRepos`.

**Rationale:** Keeps the client simple, reuses `renderRepoResults()`, and avoids N parallel requests racing. The same shape is applied to the Force Push fix.

**Alternative considered:** Client-side loop issuing one request per repo. Rejected: more error-prone, harder to render aggregated results, inconsistent with the existing commit flow.

### Decision 2: `VCS.pullForce()` = `git fetch` + `git reset --hard` + `git clean -fd`

The new primitive takes `(workDir, repoType, credential, branch, clonePort)` — the same signature shape as `pushUpstream` minus the options bag — and for git runs:
1. `git fetch origin <branch>` (with SSH env when credential/clonePort require it, mirroring `pushUpstream`).
2. `git reset --hard origin/<branch>`.
3. `git clean -fd` (remove untracked files and directories, so the worktree is truly aligned).

`reset --hard` alone leaves untracked files; `clean -fd` is required for "overwriting anything local" as specified. The new remote HEAD SHA is read via `git rev-parse origin/<branch>` and returned so the service can persist it as the baseline.

For Fossil: return `{ success: false, error: "Pull force is not supported for Fossil repositories" }` without running any command.

**Alternative considered:** `git pull` with strategy options. Rejected: pull can merge or conflict; we want a hard overwrite, which fetch+reset expresses unambiguously.

### Decision 3: Reset both worktrees, then update baseline

For each targeted repo the service:
1. `applyRepoContext(session, project, repo.projectRepoId)` to resolve per-repo paths, branch, credential, clonePort.
2. `vcs.pullForce(upstreamPath, …)` → reset platform mirror, capture new HEAD.
3. `vcs.pullForce(agentWorkspacePath, …)` → reset agent workspace to the same remote HEAD.
4. `persistRepoBaseline(session, repo.projectRepoId, newHEAD)`.
5. `invalidateCaches(sessionId, upstreamPath)` so the next preview reflects the reset.

If step 2 succeeds but step 3 fails, the repo result is `failed` with a message indicating the agent workspace could not be aligned; the platform mirror is already reset and the baseline is **not** updated (so the preview still flags the divergence).

### Decision 4: Confirmation lists affected repos, native `confirm()`

`pullForce()` in `commit-buffer.js` resolves target repos from the preview data (the same `previewData.files` repo IDs used by `populateRepoSelect`). When "All" is selected it lists every repo ID; otherwise the single selected ID. The confirm message format:

```
Pull force will discard ALL local commits and changes in:
  - repo-A
  - repo-B
Continue?
```

On cancel, no request. On accept, POST and render per-repo results.

### Decision 5: Force Push fan-out reuses the same result shape

`forcePush()` in the service is split into `forcePushAcrossRepos(sessionId, repoId?)` (iterates `session.repos` when `repoId` is falsy, otherwise acts on the single repo) and keeps `forcePush(sessionId, repoId)` for the single-repo path. The route handler calls the across-repos variant and returns `{ results }`. The frontend `forcePush()` is updated to render `renderRepoResults()` from the response, matching Pull Force.

## Risks / Trade-offs

- **[Risk] Pull Force while the agent is mid-task discards in-flight work.** → Mitigation: the confirmation dialog explicitly warns that all local changes are discarded. The ACP parking/resumption docs (`llms/acp-architecture.md`) govern agent lifecycle; this change does not pause or stop the agent. If the agent is actively writing, the reset could conflict; users are expected to use this on idle or diverged sessions. Documenting this in the button title/help text.
- **[Risk] `git clean -fd` removes user-created files that are gitignored-but-untracked.** → This is the intended "overwrite anything local" behavior. No mitigation; the confirmation makes it explicit. `clean -fd` does **not** remove ignored files (no `-x`), so `.env`-style ignored files survive.
- **[Risk] Resetting `agentWorkspacePath` races with the agent's own writes.** → Mitigation: Pull Force is a manual, user-initiated action. If the agent is running, the next sync reconciles. We do not lock the workspace; this matches the existing Force Push posture (which also mutates `upstreamPath` without locking).
- **[Trade-off] Fossil unsupported** → Acceptable given the ongoing `replace-fossil-with-git` migration. Fossil repos in a multi-repo fan-out return an explicit `failed`/`not supported` result rather than aborting the whole operation.
- **[Risk] Force Push behavior change** → "All repositories" now actually pushes all repos instead of silently hitting `repos[0]`. This is a behavior fix, but any user relying on the old (buggy) behavior would see different results. The new behavior matches the documented "All repositories" semantics and the commit flow, so the fix is aligned with user expectations.

## Migration Plan

No schema migration or data backfill. The change is additive (new endpoint, new button, new VCS method) plus a behavior fix to an existing endpoint. Deploy in a single release. Rollback is reverting the commit — the new endpoint and button simply disappear and Force Push reverts to its previous (single-repo) behavior.