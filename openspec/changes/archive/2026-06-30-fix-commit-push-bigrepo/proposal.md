## Why

After `fix-commit-preview-bigrepo` made the **preview** fast, **commit & push still hangs or times out on large repositories** — even once the file list has rendered, selecting files and clicking "commit & push" does not complete. The root cause is that the commit/apply path still runs the exact catastrophe the preview fix removed: `commitAndPushSelective` → `getCachedPatch` → `VCS.generatePatch` → `git diff --binary --no-index -- <upstream> <agent>` (`packages/mimo-platform/src/domain/commits/service.ts:105`). `--no-index` recursively walks **both entire working trees** (including `upstream/.git`) and `--binary` base85-encodes every differing blob into one giant patch string. Cost scales with repository and history size, not with how much changed.

The decisive observation: that whole-tree patch is generated **only to derive the changed-file list** (`parsePatchPreview` + `detectChangedFilesFromPatchPreviewAsync` at `service.ts:328`). The actual write step, `applySelectedFiles` (`packages/mimo-platform/src/domain/commits/changed-files.ts:14`), **copies the user-selected files from the agent workspace to the upstream checkout by path — it never consumes the patch.** So the expensive `--binary` patch is pure overhead on the commit path, exactly as it was on the preview path.

## What Changes

- In the **commit/apply path** (`CommitService.commitAndPushSelective`), derive the changed-file list from the same cheap, VCS-agnostic **stat-first two-tree comparison** (`detectChangedFiles`, with the persisted manifest store) that `getPreview` already uses — reusing the shared `changedFilesCache` when warm — instead of `getCachedPatch` + `parsePatchPreview` + `detectChangedFilesFromPatchPreviewAsync`.
- Remove the `git diff --no-index --binary` whole-tree patch generation from the commit path. `applySelectedFiles` continues to copy the selected files by path, unchanged.
- Keep `VCS.generatePatch` only if a remaining caller genuinely needs a real patch; otherwise the preview and commit paths both become pure filesystem logic. (Verify no other consumer depends on it.)
- The git/fossil **`commit` and `push`** steps on the upstream checkout (`fossil commit` / `git commit` + push to the real remote) are **unchanged** — only how the changed-file list is obtained changes.
- Preserve exact behavior: same selected-file semantics, same `applyStatuses` filtering, same two-endpoint result, same `changedFilesCache` population.

## Capabilities

### New Capabilities
- `commit-apply`: How the platform applies the user-selected subset of changes to the upstream checkout and commits/pushes them, and the requirement that obtaining the changed-file set for this path scales with the number of changed files rather than repository/history size.

### Modified Capabilities
<!-- None: commit-preview (owned by fix-commit-preview-bigrepo) already covers the preview path; this change adds the parallel guarantee for the apply path. -->

## Impact

- **`packages/mimo-platform/src/domain/commits/service.ts`**: `commitAndPushSelective` obtains changed files from `detectChangedFiles` / `changedFilesCache` instead of `getCachedPatch` + `parsePatchPreview`; the `patchCache` and `getCachedPatch` helper are removed unless still needed by a verified caller.
- **`packages/mimo-platform/src/domain/vcs/index.ts`**: `generatePatch` (`--no-index --binary`) is no longer invoked by the commit path; removed if it has no remaining callers.
- **`packages/mimo-platform/src/domain/commits/patch-preview.ts` / `changed-files.ts`**: `parsePatchPreview` / `detectChangedFilesFromPatchPreviewAsync` retired from the commit path (kept only if used elsewhere).
- **No change to Fossil or git commit/push behavior** — the upstream-persist hop (`applySelectedFiles` → `commit` → `push`) is untouched; only change detection moves to the filesystem comparison.
- **Tests**: `packages/mimo-platform/test/commit-preview-performance.test.ts` extended to assert the commit/apply path never walks `.git`/excluded dirs and never builds a whole-repository binary patch; selective-commit semantics and `applyStatuses` filtering preserved.
