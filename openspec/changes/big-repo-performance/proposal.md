# Big Repository Performance

## Why

MIMO currently assumes repositories are small enough to scan, checksum, and diff in their entirety on every session operation. Users report that the project becomes unusable with large repositories: session creation hangs, the UI stalls, impact refresh times out, and sync operations are slow. This change removes full-tree operations and replaces them with incremental, bounded, and paginated alternatives so MIMO scales to large codebases.

## What Changes

- **Lazy file sync**: `FileSyncService` will no longer recursively MD5-checksum every file in the upstream and session worktrees at session startup. It will establish baselines incrementally and only compute checksums for files that are touched.
- **Incremental impact calculation**: `ImpactCalculator` will stop running `scc` over the entire upstream and workspace on every refresh. It will compute metrics only from files that have actually changed, plus a cached baseline.
- **Paginated file listing**: The file finder API will return a bounded page of results instead of loading the entire repository file list into memory.
- **Bounded patch generation**: `git diff --no-index` over full directories will be replaced with a diff that only includes changed files and respects a size cap.
- **Streaming large Git imports**: The Fossil import timeout and progress feedback will be improved so that importing large Git histories does not abort.
- **Smarter default exclusions**: Generated directories commonly found in large repos (`node_modules`, build output, lockfiles) will be excluded by default from sync, impact, and file listing.

## Capabilities

### New Capabilities

- `lazy-file-sync`: Incremental baseline checksums and on-demand conflict detection for file synchronization.
- `incremental-impact-calculation`: Impact metrics derived from changed files plus a cached baseline instead of full-repository scans.
- `paginated-file-listing`: Server-side pagination, search, and bounded file list responses for the file finder.
- `bounded-patch-generation`: Patch creation that diffs only changed files and enforces a maximum patch size.
- `streaming-large-git-import`: Reliable import of large Git repositories into Fossil with progress feedback and adjustable limits.

### Modified Capabilities

- `file-sync`: Requirement changes — sync will no longer perform a full-tree scan on session initialization; baseline checksums are built lazily.
- `impact-tracking`: Requirement changes — impact refresh will return incremental metrics for changed files instead of full-repository metrics, while preserving trend accuracy.
- `scc-integration`: Requirement changes — `SccService` will support incremental runs on a subset of files and expose a stable baseline cache key.

## Impact

- `packages/mimo-platform/src/domain/sync/service.ts`
- `packages/mimo-platform/src/domain/impact/calculator.ts`
- `packages/mimo-platform/src/domain/impact/scc-service.ts`
- `packages/mimo-platform/src/domain/files/service.ts`
- `packages/mimo-platform/src/domain/vcs/index.ts`
- `packages/mimo-platform/src/api/rest/files.ts`
- `packages/mimo-platform/src/domain/files/path-policy.ts`
- Related tests and REST/websocket handlers that consume these services.
