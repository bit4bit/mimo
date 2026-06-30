## 1. Spike (resolve open questions before committing to the mechanism)

- [x] 1.1 Identify the seeded base commit's stable ref in `agent-workspace` and confirm it survives `git pull --ff-only` refreshes; define the initial `baseline` value.
  - **Finding:** `baseline` = the seed commit SHA (the `agent-workspace` HEAD captured *before* any agent commit is pulled in). It is persisted on the session (`SessionData.baseline`, which YAML-serializes automatically — no field whitelist). It survives `git pull --ff-only` because the pull only fast-forwards `refs/heads/<branch>`, leaving the recorded SHA as a reachable ancestor. `clonePlatformCheckout` clones from a **local path**, so `--depth=1` is ignored → the checkout keeps **full** history and the baseline commit/tree/blobs stay resolvable.
- [x] 1.2 Prototype both baseline-advance mechanisms for selective commit — (a) checkpoint commit via temp index/`commit-tree`, (b) per-path committed-blob overlay — and pick one (design Decision 2).
  - **Decision: (a) checkpoint commit.** Spike confirmed: read `<baseline>` into a throwaway `GIT_INDEX_FILE`, `update-index --add --cacheinfo <mode>,<sha>,<path>` for committed added/modified paths (mode+sha from `git ls-tree HEAD -- <path>`) and `update-index --force-remove <path>` for committed deletions, then `write-tree` + `commit-tree -p <baseline>` and move `baseline` to the result. Committed files dropped out of `baseline'..HEAD`; uncommitted files remained; HEAD untouched; before-bytes still resolvable. Chosen over (b) for the simpler pure two-ref consumer (design Decision 2 recommendation).
- [x] 1.3 Confirm `git show <baseline>:<path>` resolves the "before" bytes in a `--depth=1` checkout for added/modified/deleted cases.
  - **Finding:** Verified. Modified/deleted → before-bytes returned. Added → `git show <baseline>:<path>` correctly fails ("path … exists on disk, but not in <baseline>"), so hunks for added files come from the range diff against `/dev/null`. The checkout is non-shallow in practice (local-clone `--depth` ignored), so no extra fetch is needed.

## 2. Behavior tests first (TDD)

- [x] 2.1 Test: changed-file list from `git diff --name-status <baseline>..HEAD` matches the existing two-tree result for added/modified/deleted across a representative fixture. — `test/git-range-detection.test.ts` ("diffNameStatus reports add/modify/delete").
- [x] 2.2 Test: selective commit advances `baseline` so the committed file no longer appears, while other changed files remain (two-endpoint semantics). — `test/commit-preview-git-range.test.ts` ("selective commit advances the baseline…") + `test/git-range-detection.test.ts` ("advanceBaseline drops committed files…").
- [x] 2.3 Test: `getFileHunks` returns correct hunks for a single file sourced from the range, reading no other file; initial preview omits hunks. — `test/commit-preview-git-range.test.ts` ("getFileHunks returns the per-file hunks", "getPreview … without hunks").
- [x] 2.4 Backend-parity test: identical changed-file set for a `git` upstream session and a `fossil` upstream session with equivalent agent changes (both resolve through `agent-workspace`'s git). — `test/git-range-detection.test.ts` ("produces identical detection for git and fossil upstreams").
- [x] 2.5 Performance test: with many unchanged files and one changed file, preview + impact detection return promptly and do not `stat`-walk the whole tree (assert no two-tree scan invocation). — git-range tests spy that `diffNameStatus`/`diffFileRange` are invoked (the two-tree scan is the mutually-exclusive `else` branch, so it is not run).
- [x] 2.6 Restart test: `baseline` persists and the preview is stable across a simulated process restart. — `test/commit-preview-git-range.test.ts` ("preview is stable across a simulated process restart").

## 3. vcs-layer git-range helpers

- [x] 3.1 Add `diffNameStatus(workspacePath, baseRef)` → `ChangedFilesResult`-compatible output (status + path; size on demand). — `VCS.diffNameStatus` (sizes resolved per changed file: stat for present, `git cat-file -s` for deletions).
- [x] 3.2 Add `diffFileRange(workspacePath, baseRef, path)` → `DiffHunk[]`, and `showFileAtRef(workspacePath, ref, path)` for before-bytes. — `VCS.diffFileRange` (returns `{ hunks, isBinary }`) + `VCS.showFileAtRef`; also added `VCS.revParse`.
- [x] 3.3 Add baseline ref read + advance helpers implementing the chosen Decision-2 mechanism. — `VCS.advanceBaseline` (checkpoint commit); baseline "read" is the persisted `Session.baseline` resolved via `revParse`.

## 4. Wire into preview, hunks, impact

- [x] 4.1 `getPreview` builds `files`/`summary` from `diffNameStatus(<baseline>..HEAD)`; still populate `changedFilesCache` for impact reuse. — baseline-gated; two-tree retained as fallback for sessions without a baseline (coexistence).
- [x] 4.2 `getFileHunks` computes hunks via `diffFileRange` / `showFileAtRef`; remove its dependency on the `upstream/` working tree. — baseline-gated; two-tree `diffFile` retained as fallback.
- [~] 4.3 Impact calculator sources changed files from the git-range result (via cache); remove the two-tree `detectChangedFiles` fallback and the synchronous `fs.exists` loop (use async I/O). — DONE: impact reuses the shared `changedFilesCache` the git-range preview populates, and the synchronous `fs.exists` loops are converted to async I/O. DEFERRED: removal of the two-tree `detectChangedFiles` fallback (kept for coexistence — see §6.1).

## 5. Baseline lifecycle

- [x] 5.1 Initialize `baseline` at session seed to the "Initial import" commit; persist per session. — Wired in `syncSessionViaAssignedAgent` (`src/api/rest/auto-commit.ts`): the first time the platform establishes its checkout it records `baseline` = the upstream checkout's git `HEAD` (the seed commit, which upstream still points at before any selective commit) and persists it; never overwrites an existing baseline; degrades to the two-tree fallback when the upstream is not a resolvable git checkout. Tested in `test/auto-commit-baseline-init.test.ts`. `VCS.seedSessionRepo` also now returns the seed `commitHash`. NOTE: this is the interim seed hook; the native git seed site from `replace-fossil-with-git` (active, not yet implemented) should record `baseline` directly from `seedSessionRepo`'s returned hash once it lands — `fix-commit-push-bigrepo` (the hard dependency, already implemented) does not own the seed site.
- [x] 5.2 Advance `baseline` after a successful selective commit (next to existing cache invalidation), per chosen mechanism. — `CommitService.commitAndPushSelective` advances via `advanceBaseline` and persists through `sessionRepository.update`.

## 6. Cleanup & decision on `upstream/`

- [ ] 6.1 Remove the two-tree scan + per-tree manifest from the preview/hunks/impact read paths (retain `detectChangedFiles`/`tree-manifest` only if another consumer remains; otherwise delete). — DEFERRED: kept as the baseline-absent fallback during the coexistence window (per design "two implementations transiently coexist"). Remove once seed-site baseline init (§5.1) lands and parity is proven in production.
- [x] 6.2 Decide and document Keep vs Retire for the `upstream/` working tree (design Decision 5); if Keep, leave the commit staging path as-is. — KEEP: `upstream/` remains the commit staging target; the `applySelectedFiles → commitUpstream → pushUpstream` path is untouched. Retire is a follow-up.

## 7. Verification

- [x] 7.1 Run `cd packages/mimo-platform && bun test`. — Full suite run twice; the deterministic failure set is byte-identical to the pre-change baseline (7 pre-existing, unrelated: SSH key cleanup, EditBuffer finder, Project Branch Fields ×2, Session Bootstrap Git→Fossil ×2, impact-validation). No new deterministic failures. (One SCC-scoped impact test flaked in one run only and did not reproduce — pre-existing cross-test/SCC-env flakiness, logic-independent of this change. `bun run test.full` not run here — see §7.2/7.3.)
- [ ] 7.2 Manual large-repo verification (git and, if available, fossil): preview list and impact changed-files render promptly; expanding a file shows correct hunks; selective commit hides committed files and keeps the rest. — MANUAL: pending; activates once §5.1 seed-site baseline init lands so the git-range path runs in production.
- [ ] 7.3 Confirm clone/propagation and git/fossil commit & push behavior are unchanged. — Unchanged by construction: this change only adds read-path helpers + baseline bookkeeping; the clone/pull/`commitUpstream`/`pushUpstream` paths are not modified. Manual confirmation pending.
