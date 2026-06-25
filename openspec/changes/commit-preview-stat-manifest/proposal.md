## Why

The commit preview is now a size-first two-tree compare (`detectChangedFiles`), which removed the catastrophic `git diff --no-index --binary` walk of `.git`. But one cost remains: to tell whether two same-size files differ, it reads their content — and **unchanged files always have the same size**, so essentially all source content is re-read on *every* preview (`O(source bytes)`). On repositories with many source files this is the remaining slowness.

Git solves the equivalent problem with an index/stat-cache: it skips re-reading files whose `stat` (size + mtime) hasn't moved. We can do the same, VCS-agnostically.

## What Changes

- Maintain a **persisted manifest per working tree per session** — `path → { size, mtime, hash }` — for both the upstream checkout and the agent workspace.
- During a preview scan, `stat` each non-excluded file; if its `size` **and** `mtime` match the manifest, **reuse the stored hash without reading the file**. Otherwise read it, recompute the hash, and update the manifest entry.
- Derive the upstream→agent delta by comparing the two manifests by hash, preserving today's exact two-endpoint preview results.
- Extend the injected filesystem abstraction so `stat`/`statAsync` expose `mtimeMs` (currently only `size`).
- Refresh/invalidate the upstream tree's manifest after a successful commit (where the upstream tree changes), alongside the existing cache invalidation.

Net effect: preview content reads drop from `O(source bytes)` to `O(changed bytes)` — only files you actually touched are read.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `commit-preview`: Add a requirement that the preview avoids re-reading file content whose `size` and `mtime` are unchanged since the last scan, via a persisted stat+hash manifest. (Capability introduced by the `fix-commit-preview-bigrepo` change; this adds a performance/read-minimization requirement to it.)

## Impact

- **`packages/mimo-platform/src/domain/files/changed-files.ts`**: `detectChangedFiles` consults/updates per-tree manifests; reads content only on stat-cache miss.
- **New manifest store** (e.g. `packages/mimo-platform/src/domain/files/tree-manifest.ts`): load/save `path → {size, mtime, hash}` per tree, persisted per session.
- **`packages/mimo-platform/src/infrastructure/os/types.ts`** + **`node-adapter.ts`**: `stat`/`statAsync`/`lstat` results gain `mtimeMs`.
- **`packages/mimo-platform/src/domain/commits/service.ts`**: invalidate/refresh the upstream manifest after a successful commit (next to existing `invalidatePatchCache`).
- **No impact on Fossil behavior or on git-only assumptions** — the manifest is pure filesystem state; both backends benefit.
- **Trade-off (accepted, identical to git's racy-clean):** a file edited to the exact same size *and* mtime could be missed; vanishingly rare because edits update mtime.
- **Out of scope:** the commit/apply (`--binary` patch) path, VCS-native `git status`/`fossil changes` detection, and the already-fast on-demand `getFileHunks` per-file diff.
- **Tests:** extend `test/changed-files-size-first.test.ts` and `test/commit-preview-performance.test.ts`.
