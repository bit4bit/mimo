## 1. VCS Layer

- [x] 1.1 Add `pullForce(workDir, repoType, credential, branch, clonePort)` to `src/domain/vcs/index.ts`: for git run `git fetch origin <branch>` (SSH env like `pushUpstream`), `git reset --hard origin/<branch>`, `git clean -fd`, then `git rev-parse origin/<branch>` to return `{ success, output: newHEAD, error }`. For fossil return `{ success: false, error: "Pull force is not supported for Fossil repositories" }`.
- [x] 1.2 Add unit tests in `test/vcs.test.ts` for `pullForce`: git success (fetch+reset+clean+rev-parse called in order, returns new HEAD), git fetch failure, fossil returns "not supported", SSH env applied when credential is ssh.

## 2. Commit Service

- [x] 2.1 Add `pullForce(sessionId, repoId?)` and `pullForceAcrossRepos(sessionId, repoId?)` to `src/domain/commits/service.ts`. `pullForceAcrossRepos` iterates `session.repos` when `repoId` is falsy (else targets the single repo); for each repo it `applyRepoContext`, calls `vcs.pullForce` on `upstreamPath` then `agentWorkspacePath`, persists the new baseline via `persistRepoBaseline`, invalidates caches, and aggregates `MultiRepoResult`.
- [x] 2.2 Handle partial failure: if the upstream reset succeeds but the agent workspace reset fails, mark the repo `failed` with an "agent workspace not aligned" message and do **not** update the baseline.
- [x] 2.3 Fix `forcePush` to fan out: add `forcePushAcrossRepos(sessionId, repoId?)` mirroring `commitAndPushAcrossRepos`, keep the existing single-repo `forcePush(sessionId, repoId)` as the per-repo path. When `repoId` is falsy, iterate `session.repos`; aggregate per-repo results.
- [x] 2.4 Add unit tests in `test/commits.test.ts` for `pullForceAcrossRepos` (single repo, all repos, fossil repo returns "not supported" result while others succeed, baseline updated on success, upstream-success/workspace-failure leaves baseline unchanged) and `forcePushAcrossRepos` (all repos pushes each repo, single repo only targets that repo).

## 3. REST Routes

- [x] 3.1 Add `POST /commits/:sessionId/pull-force` to `src/api/rest/commits.ts` mirroring `push-force`: read `repoId` from query/body, call `service.pullForceAcrossRepos`, return `{ success, message, results }`.
- [x] 3.2 Update `POST /commits/:sessionId/push-force` to call `service.forcePushAcrossRepos(sessionId, repoId)` and return `{ success, message, results }` (per-repo results) instead of the single-result shape.
- [x] 3.3 Add route tests in `test/commits.test.ts` (or a dedicated route test file matching the existing pattern) for `pull-force` (success, missing session, multi-repo results) and update the existing `push-force` test to assert per-repo results when "All repositories" is targeted.

## 4. Frontend Component

- [x] 4.1 Add the `pull-force-btn` button to `src/web/features/sessions/components/buffers/CommitBuffer.tsx`, positioned left of `#force-push-btn`, class `btn-danger`, with `title` warning that local commits and changes are discarded, and `data-help-id="commit-buffer-pull-force-btn-button"`.
- [x] 4.2 Update `test/frontend/components/commit-buffer.test.tsx` to assert `id="pull-force-btn"` exists and precedes `force-push-btn`.

## 5. Frontend Script

- [x] 5.1 Add `pullForce(repoId?)` to `public/js/commit-buffer.js`: resolve target repos (from preview data repo IDs when "All" selected, else the single repo), show native `confirm()` listing affected repos with the destructive warning, on accept POST `/commits/:sessionId/pull-force`, disable/re-enable the button, render per-repo results via `renderRepoResults`, update `#commit-status`.
- [x] 5.2 Wire `pull-force-btn` onclick in `wireActionButtons()` and expose `pullForce` on `window.MIMO_COMMIT_BUFFER`.
- [x] 5.3 Update `forcePush()` to render per-repo results from the new `push-force` response shape via `renderRepoResults` (mirroring `submit()`).
- [x] 5.4 Update the per-repo retry button in `renderRepoResults` (the "Force Push" retry) to keep working with the across-repos response shape.
- [x] 5.5 Add frontend tests in `test/frontend/js/commit-buffer.test.ts`: Pull Force confirmation lists affected repos, cancel issues no request, accept posts to `pull-force`, success renders per-repo results, button re-enabled after completion; Force Push with "All repositories" renders per-repo results.

## 6. Help System

- [x] 6.1 Add the `commit-buffer-pull-force-btn-button` help entry (orientation help system) describing the Pull Force button and its destructive nature, matching the existing `commit-buffer-force-push-btn-button` entry.

## 7. Validation

- [x] 7.1 Run `bun test` in `packages/mimo-platform` and ensure all new and updated tests pass.
- [x] 7.2 Run `openspec validate add-pull-force-button` and resolve any reported issues.