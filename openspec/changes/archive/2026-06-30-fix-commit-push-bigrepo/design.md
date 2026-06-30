## Context

`fix-commit-preview-bigrepo` replaced the `git diff --no-index --binary` whole-tree handoff in `CommitService.getPreview` with a stat-first two-tree comparison (`detectChangedFiles`), and `commit-preview-stat-manifest` added a persisted `path → {size, mtime, hash}` manifest so unchanged files are not re-read. But the **commit/apply path was explicitly left on the old patch** ("`generatePatch` retained for commit/apply only"). The result is that `commitAndPushSelective` still pays the full catastrophe: it shells out to

```
git diff --binary --no-index --no-color -- <upstreamDir> <agentDir>
```

walking both `.git` stores and base85-encoding every blob, then `parsePatchPreview` + `detectChangedFilesFromPatchPreviewAsync` reconstruct a changed-file list from the giant string. On a large repository this times out — the user sees the preview render, selects files, clicks commit & push, and nothing completes.

The key realization is that the commit path does **not** need a patch at all. The write step `applySelectedFiles(os, upstreamPath, agentWorkspacePath, pathsToApply)` copies each selected path from the workspace to upstream (and deletes paths absent from the workspace) using the filesystem only. The patch is generated solely to produce `pathsToApply`'s source — the changed-file list — which `getPreview` already computes cheaply and caches in `changedFilesCache`.

Constraints:
- Same `repoType: "git" | "fossil"` constraint as the preview fix: the change-detection step must stay backend-neutral and not add a git dependency to the domain.
- The endpoint must stay `upstream → agent-workspace`, including the selective-commit case (a file already committed upstream must not reappear).
- The `commit` and `push` steps on the upstream checkout must be byte-for-byte unchanged — this change is scoped to **how the changed-file list is obtained**, not how changes are persisted.

## Goals / Non-Goals

**Goals:**
- Make commit & push on a large repository complete promptly — cost scales with the number of changed files plus a stat of the tracked tree, not with repository/history size.
- Never traverse, read, or base85-encode `.git`/`_FOSSIL_`/excluded paths during the commit path.
- Reuse the exact detection already used by the preview (`detectChangedFiles` + manifest + `changedFilesCache`) so preview and commit can never disagree.

**Non-Goals:**
- Changing `applySelectedFiles` copy/delete semantics, `applyStatuses` filtering, or the `commit`/`push` steps.
- The native-git-range-diff rearchitecture (that is the separate `git-range-diff-detection` change). This change is the minimal, low-risk fix that mirrors the preview fix.
- Honoring full `.gitignore`/`.mimoignore` globs (same scope as the preview fix).

## Decisions

### Decision 1: Commit path consumes the stat-diff / shared cache, not a patch

`commitAndPushSelective` obtains its `changes` (`ChangedFilesResult`) by:
1. checking `changedFilesCache` for a warm entry keyed by `(sessionId, upstreamPath, agentWorkspacePath)` (populated by the immediately-preceding `getPreview` in the normal preview-then-commit flow), and
2. otherwise calling `detectChangedFiles(os, upstreamPath, agentWorkspacePath, undefined, manifestStore)` with the same persisted manifest store `getPreview` uses.

`applyStatuses` filtering, `selectedPaths` validation, and the empty-selection guards are applied to this result exactly as today. `applySelectedFiles` is called unchanged.

### Decision 2: Remove `getCachedPatch` / `patchCache` from the commit path

The 30s `patchCache` existed to avoid running `git diff` twice in the preview-then-commit flow. With both paths sourced from the stat-diff + manifest + `changedFilesCache`, the patch cache is dead. Remove `getCachedPatch` and `patchCache`. Audit `generatePatch`, `parsePatchPreview`, and `detectChangedFilesFromPatchPreviewAsync` for any remaining callers; delete those that become unused, retain any with a verified consumer.

### Decision 3: Upstream-persist hop is untouched

`applySelectedFiles` → `vcs.commit(...)` (git or fossil) → `vcs.push(...)` is left exactly as-is. This change carries no `repoType` branching of its own; it removes work *before* that hop.

## Risks / Trade-offs

- **`isBinary` per file**: if any commit-path consumer relied on `--binary` patch metadata to mark binary files, that signal disappears. Mitigation: the same question was resolved for the preview fix (NUL-byte sniff on demand if needed); reuse that resolution. Most likely the commit path never used it.
- **Cache staleness**: reusing a warm `changedFilesCache` entry assumes the workspace did not change between preview and commit. The TTL/keying already governs this for impact analysis; the commit path falls back to a fresh `detectChangedFiles` on a cache miss, so correctness does not depend on the cache.
- **Reads content of size-equal files** (inherited from `detectChangedFiles`): bounded by the manifest stat-cache (`commit-preview-stat-manifest`); unchanged files with stable `size`+`mtime` are not re-read.

## Migration Plan

- Pure internal refactor of the commit path; no API shape change to `commitAndPushSelective`'s result, no data migration.
- Rollback is reverting `commitAndPushSelective` to `getCachedPatch` + `parsePatchPreview`.

## Open Questions

- Does any caller of `generatePatch` / `parsePatchPreview` / `detectChangedFilesFromPatchPreviewAsync` remain after this change (e.g., a debug/export path)? Decides whether they are deleted or retained.
- Should the commit path force a fresh `detectChangedFiles` (ignoring the cache) for safety, accepting one extra stat-walk, or trust the warm cache from the preview that immediately precedes it?
