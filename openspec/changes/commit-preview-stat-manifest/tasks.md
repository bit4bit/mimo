## 1. Behavior tests first (TDD)

- [ ] 1.1 In `test/changed-files-size-first.test.ts`, add: a second `detectChangedFiles` run over an unchanged tree reads no file content (spy on `os.fs.readFileAsync`) and returns the same result as the first.
- [ ] 1.2 Add: when exactly one file changes between two runs, only that file is re-read and it is reported `modified`.
- [ ] 1.3 Add: a file whose `size` and `mtime` are unchanged is not re-read even if a sibling changed.
- [ ] 1.4 Add: a missing/corrupt manifest falls back to a full read+hash and still yields the correct delta (cache is never required for correctness).
- [ ] 1.5 In `test/commit-preview-performance.test.ts`, add: a second `getPreview` of an unchanged session reads no file content; and after a commit, the next `getPreview` reflects the new upstream state.

## 2. Filesystem abstraction: expose mtime

- [ ] 2.1 Add `mtimeMs: number` to the `stat`/`statAsync` (and `lstat`/`lstatAsync`) result types in `src/infrastructure/os/types.ts`.
- [ ] 2.2 Populate `mtimeMs` from Node `Stats.mtimeMs` in `src/infrastructure/os/node-adapter.ts`.
- [ ] 2.3 Update any test fakes / mock `os` objects that construct stat results to include `mtimeMs`.

## 3. Manifest store

- [ ] 3.1 Add a manifest module (e.g. `src/domain/files/tree-manifest.ts`) with load/save for `path → { size, mtime, hash }`, persisted per tree under `<sessionDir>/.manifests/<treeBasename>.json`, using atomic write (temp + rename).
- [ ] 3.2 Loading a missing or unparseable manifest returns an empty manifest (no throw).

## 4. Wire the manifest into detection

- [ ] 4.1 In `detectChangedFiles`, accept a per-tree manifest (or a manifest store + tree key) and, during the scan, reuse the stored hash when `size` and `mtimeMs` match; otherwise read, hash, and update.
- [ ] 4.2 Build the new manifest from the current scan (so deleted files drop out) and persist it; compare the two trees by hash to produce the delta.
- [ ] 4.3 Keep `detectChangedFiles` correct with no manifest provided (callers like the impact fallback continue to work).

## 5. Commit invalidation

- [ ] 5.1 In `CommitService`, delete/invalidate the upstream tree's manifest on a successful commit, alongside the existing `invalidatePatchCache` / `changedFilesCache.invalidate`.

## 6. Verification

- [ ] 6.1 Run `cd packages/mimo-platform && bun test`; confirm no new failures vs. the known pre-existing set, and the new manifest tests pass.
- [ ] 6.2 Confirm the preview path remains VCS-agnostic (no `git`/`fossil` calls added to `domain/files` or `domain/commits` detection).
- [ ] 6.3 Sanity-check timing: a repeated preview of a large unchanged tree is materially faster than the first (no content reads).
