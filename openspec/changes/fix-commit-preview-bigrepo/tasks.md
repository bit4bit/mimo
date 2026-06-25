## 1. Behavior tests first (TDD)

- [x] 1.1 Extend `test/commit-preview-performance.test.ts`: assert the preview never lists `.git`/excluded entries and that no `.git` content is read/walked, with `upstream/` containing a real `.git` directory.
- [x] 1.2 Add a test for two-endpoint semantics: after a selective commit of one file, a fresh `getPreview` must NOT list that now-identical file, while genuinely-different files still appear.
- [x] 1.3 Add a backend-parity test: the preview is computed from the filesystem only (no VCS invocation), so the same upstream/workspace contents produce identical results regardless of repoType.
- [x] 1.4 Add a "one change among many unchanged files" test asserting only the changed file is listed, and that added/deleted/size-differing files are classified without reading their content (e.g., via an `os` adapter spy on content reads).
- [x] 1.5 Add a `getFileHunks` test asserting hunks are returned for the requested file only, and that the initial `getPreview` response contains no hunks.

## 2. Filtered two-tree stat-diff (domain)

- [x] 2.1 Implement a VCS-agnostic two-tree comparison that walks `upstream/` and `agent-workspace/` via the exclusion-aware `scanDirectory` (which already prunes `EXCLUDED_PATHS`).
- [x] 2.2 Classify each path as `added`/`deleted` (one side only, no read) or, for paths on both sides, `modified` when sizes differ (no read) else content-compare with early-exit byte comparison only for size-equal pairs.
- [x] 2.3 Use the async filesystem adapter (`existsAsync`/`statAsync`/`readFileAsync`) so the walk does not block the event loop (mirror `detectChangedFilesFromPatchPreviewAsync`).
- [x] 2.4 Produce a `ChangedFilesResult` (files + summary) compatible with the existing `changedFilesCache` contract.

## 3. Wire into CommitService

- [x] 3.1 `getPreview` builds `files`/`summary` from the stat-diff instead of `getCachedPatch` + `parsePatchPreview`; still populate `changedFilesCache` from the same result.
- [x] 3.2 `getFileHunks` computes hunks for the single requested file from its two versions only (backend-neutral diff), preserving the `DiffHunk` shape and `isBinary` semantics.
- [x] 3.3 Determine `isBinary` per file without the `--binary` patch (e.g., NUL-byte sniff on demand) if any consumer relies on it; otherwise document its removal from the preview.
- [x] 3.4 Keep `patchCache`/`generatePatch` for the commit/apply path only; confirm `commitAndPushSelective` is unchanged in behavior.

## 4. Exclusion policy

- [x] 4.1 Add `node_modules` to `EXCLUDED_PATHS` in `path-policy.ts` (and decide/justify any additional build dirs vs. relying on `.gitignore`); update/add policy tests.

## 5. Cleanup & verification

- [x] 5.1 Remove now-dead reliance on `filterVcsMetadata` for the preview path (retain only where commit/apply still needs it); delete unused preview-only code paths.
- [x] 5.2 Run `cd packages/mimo-platform && bun test` and `bun run test.full`; ensure the existing performance test's `< 5000ms` bounds still pass and tighten if appropriate.
- [ ] 5.3 Manually verify a large-repo session: single-file change preview returns promptly and lists only the changed file (git and, if available, fossil).
- [x] 5.4 Confirm no new direct `git`/`fossil` calls were added to `domain/commits/*` (the preview path stays VCS-agnostic).
