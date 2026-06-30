## 1. Behavior tests first (TDD)

- [x] 1.1 Extend `test/commit-preview-performance.test.ts`: with `upstream/` containing a real `.git` directory, assert the commit/apply path (`commitAndPushSelective`) never walks/reads `.git` or `EXCLUDED_PATHS` and never builds a whole-repository binary patch (spy on the `os` content-read adapter and on `vcs.generatePatch`).
- [x] 1.2 Add a test asserting selective-commit semantics are preserved: committing one selected file copies only that file to upstream, commits, and a subsequent preview no longer lists it while other changed files remain.
- [x] 1.3 Add a test asserting `applyStatuses` filtering (added/modified/deleted) and `selectedPaths` validation behave identically to the patch-derived implementation.
- [x] 1.4 Add a "one change among many unchanged files" test for the commit path asserting it completes promptly and copies only the changed/selected file(s).
- [x] 1.5 Add a backend-parity assertion: change detection on the commit path is filesystem-only (no `vcs` invocation) and identical for `git` and `fossil` repoTypes.

## 2. Re-source the commit path's changed-file list (domain)

- [x] 2.1 In `CommitService.commitAndPushSelective`, replace `getCachedPatch` + `parsePatchPreview` + `detectChangedFilesFromPatchPreviewAsync` with: warm `changedFilesCache` lookup, else `detectChangedFiles(os, upstreamPath, agentWorkspacePath, undefined, manifestStore)` using the same persisted manifest store as `getPreview` (extracted into a shared `manifestStoreFor` helper).
- [x] 2.2 Apply `applyStatuses` filtering, `selectedPaths` validation, and empty-selection guards to the `ChangedFilesResult` exactly as today.
- [x] 2.3 Populate `changedFilesCache` from the same result (preserve the impact-analysis reuse contract).
- [x] 2.4 Leave `applySelectedFiles` and the `commit`/`push` steps unchanged.

## 3. Remove the whole-tree patch from the commit path

- [x] 3.1 Delete `getCachedPatch` and `patchCache` from `CommitService` (no longer used by either path). Also removed the now-orphaned `vcs.storePatch` call from the commit path (it persisted the whole-repo patch we no longer generate; the stored patches were never read back — only `generateAndApplyPatch` consumes stored patches, and it stores its own). `invalidatePatchCache` was renamed to `invalidateCaches`.
- [x] 3.2 Audited callers:
  - `detectChangedFilesFromPatchPreviewAsync` — only caller was the commit path; **deleted**.
  - `vcs.generatePatch` — **retained**: still consumed by `vcs.generateAndApplyPatch` (covered by `test/patch-sync.test.ts`). No longer called by `commits/*`.
  - `parsePatchPreview` — **retained**: still consumed by `CommitService.getFileHunks` (on-demand single-file diff) and `detectChangedFilesFromPatch`.
  - `detectChangedFilesFromPatchPreview` (sync) + `detectChangedFilesFromPatch` — out of audit scope; retained (referenced by `test/commit-preview-performance.test.ts`), pre-existing and untouched by this change.
- [x] 3.3 The commit path never consumed per-file `isBinary` from the `--binary` patch (it only read `path`/`status`/`size` via `detectChangedFilesFromPatchPreviewAsync`), so there is nothing to migrate. `getFileHunks` still derives `isBinary` from the on-demand single-file diff, unchanged.

## 4. Verification

- [x] 4.1 Ran `cd packages/mimo-platform && bun test`: 1141 pass; the only commit-domain failure was `commits.test.ts > should store patch...`, which asserted the removed patch-storage behavior and was updated to the new contract (now green). The 7 other failures (credentials SSH cleanup, projects branch fields, session-bootstrap git→fossil, impact metric/editbuffer) are pre-existing/environmental — verified identical at session-start commit `81aba17` in a clean worktree, in domains this change does not touch. Performance bounds (`< 5000ms`) pass. (`bun run test.full` requires the integration harness; not run here — see 4.2.)
- [ ] 4.2 Manually verify on a large-repo session: render preview, select a subset, commit & push completes promptly; confirm only selected files were committed upstream and pushed (git and, if available, fossil). **(Requires a running environment — deferred to the user per repo policy on not starting prod servers.)**
- [x] 4.3 Confirmed no new direct `git`/`fossil` calls in `domain/commits/*` (only comments and patch-header regex remain; no `spawn`/`command.run`/`execCommand`/`execSync`). The change-detection path stays VCS-agnostic.
