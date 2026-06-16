# Design: Big Repository Performance

## Context

MIMO keeps two worktrees per session: the upstream worktree (a clone of the original repository) and the agent workspace. Several subsystems currently treat these worktrees as small enough to scan completely on every operation:

- `FileSyncService.initializeSession()` recursively MD5-checksums every file in both trees to build a baseline.
- `ImpactCalculator.calculateImpact()` runs `scc` on the entire upstream and workspace trees on every manual refresh, then diff-matches the two outputs.
- `FileService.listFiles()` returns the entire repository file list as a single JSON array.
- `VCS.generatePatch()` runs `git diff --binary --no-index` over the two full directories.
- `VCS.importGitToFossil()` and `importToFossil()` run Fossil import/addremove with a fixed 10-minute timeout.

These operations are O(repository size). For large codebases they cause timeouts, memory spikes, and UI stalls.

## Goals / Non-Goals

**Goals:**

- Session initialization must not require a full recursive scan of the repository.
- Impact refresh must complete in a bounded time independent of total repository size.
- File finder must return bounded, paginated results.
- Patch generation must produce bounded output and avoid full-directory diffs.
- Large Git imports must not abort due to a fixed timeout.
- Generated artifacts commonly found in large repos must be excluded by default from sync, impact, and listing.

**Non-Goals:**

- Replacing Fossil with another VCS.
- Horizontal scaling or sharding.
- Streaming partial chat histories (that is tracked separately).
- Replacing the agent-side file watcher architecture.

## Decisions

### 1. Lazy baseline for file sync

Instead of scanning both trees at startup, `FileSyncService` will record baselines only for files that the agent reports as changed. On first change to a path, the service reads the original file once to record the baseline checksum, then proceeds with normal conflict detection. This keeps startup O(1) while preserving correctness: conflicts are only detected for files the agent actually touches.

A optional full scan can still be triggered manually via an existing sync endpoint for users who want a complete initial baseline.

### 2. Incremental impact calculation

`ImpactCalculator` will accept a cached baseline metric object keyed by `(upstreamPath, workspacePath, lastSyncAt)`. On refresh it will:

1. Detect changed files using `detectChangedFiles()` (which already does a targeted comparison).
2. Run `scc --by-file -f json` only on the changed files plus a small sample of unchanged files for baseline normalization.
3. Merge the incremental result with the cached baseline metrics to produce the same `ImpactMetrics` shape.
4. Update the cached baseline only when the workspace is fully synced or on explicit request.

This keeps the runtime proportional to the size of the change, not the repository.

### 3. Paginated file listing

`FileService.listFiles()` will be extended with optional `cursor`, `limit`, and `query` parameters. The walker will stop once it has collected `limit` matching results plus one extra to determine whether a next page exists. The API will return `{ files, nextCursor, hasMore }`.

The current in-memory search/scoring logic will be moved server-side but kept bounded: the walker filters by `query` during traversal and only accumulates up to `limit + 1` results.

### 4. Bounded patch generation

`VCS.generatePatch()` will be changed to:

1. Use `detectChangedFiles()` to get the exact changed paths.
2. Run `git diff --binary --no-index --` only for those paths.
3. Accumulate patch size and abort with a clear error if a configurable maximum is exceeded.

This avoids producing multi-megabyte patches for large generated files or broad refactors.

### 5. Streaming large Git imports

The Fossil import path will be split into two phases with progress logging and an adjustable timeout:

1. `git clone` / fetch with a timeout scaled to repository size.
2. `fossil import --git` with chunked progress and a longer, configurable timeout.

The timeout will be read from environment configuration at startup and injected into `VCSConfig`, keeping the service free of direct `process.env` access per project rules.

### 6. Expanded default exclusions

`EXCLUDED_PATHS` in `path-policy.ts` will gain additional entries and a new companion function `isGeneratedOrVendorPath()` for subsystems that want stricter filtering than the existing `isExcluded()`.

New defaults will include: `node_modules`, `__pycache__`, `.next`, `dist`, `build`, `out`, `target`, `vendor`, `*.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `*.min.js`, `*.min.css`.

## Risks / Trade-offs

- **[Risk] Lazy baselines miss conflicts that already existed before the agent connected.**
  → Mitigation: a manual "full sync baseline" button/endpoint remains available; sessions created from a clean upstream start do not need it.

- **[Risk] Incremental impact metrics drift from full-repo metrics over time.**
  → Mitigation: baseline is refreshed on every explicit full refresh and after each successful commit/push; validation checks still compare against absolute totals when a baseline is fresh.

- **[Risk] Paginated file listing changes the REST response shape.**
  → Mitigation: the new endpoint will be versioned with query parameters and fall back to the old behavior when no pagination params are supplied. **BREAKING** for clients that always expected a flat array.

- **[Risk] Bounded patch generation rejects legitimate large changes.**
  → Mitigation: the cap is configurable; when exceeded the UI shows an error suggesting a staged commit or smaller patch.

- **[Risk] Larger import timeouts hide real hangs.**
  → Mitigation: progress logging is emitted every 30 seconds; a separate maximum absolute cap prevents infinite waits.

## Migration Plan

1. Add new capabilities behind feature flags or optional parameters so existing behavior is preserved by default.
2. Update the web UI to use paginated file listing and incremental impact refresh.
3. Run the full test suite on small repos to confirm no regressions.
4. Manually test with a repository of at least 50k files to validate timeouts and memory.
5. Remove legacy full-scan fallback once the new paths are stable.

## Open Questions

- What is the concrete maximum patch size users expect? (default: 5 MB?)
- Should the incremental impact baseline be persisted to disk or kept in memory only?
- Should the lazy sync full-scan fallback be exposed in the UI or only as an API endpoint?
