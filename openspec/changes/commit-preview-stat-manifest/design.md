## Context

`detectChangedFiles` (`domain/files/changed-files.ts`) compares the upstream checkout and the agent workspace size-first: added/deleted/size-differing files are classified from `stat` alone, but two files of equal size are read to compare content. Because unchanged files are always size-equal, the preview re-reads essentially all source content on every run (`O(source bytes)`).

Git avoids this with its index: it records each tracked file's `stat` (size + mtime) and skips re-reading any file whose `stat` is unchanged. We want the same effect without depending on git or fossil — the preview must stay a pure-filesystem, two-endpoint compare (it already runs for both backends).

Relevant current state:
- `scanDirectory` already prunes `EXCLUDED_PATHS` (`.git`, `node_modules`, fossil internals).
- The injected `os.fs.stat`/`statAsync` expose only `{ isFile, isDirectory, size }` — **no mtime**.
- `CommitService` already invalidates an in-memory `changedFilesCache` and a patch cache on a successful commit.

## Goals / Non-Goals

**Goals:**
- Reduce preview content reads from `O(source bytes)` to `O(changed bytes)`.
- Keep the preview VCS-agnostic; fossil benefits identically; no git dependency in the domain.
- Preserve the exact two-endpoint results produced today (the manifest is a cache, never a source of truth for correctness).

**Non-Goals:**
- Changing the commit/apply (`--binary` patch) path.
- VCS-native `git status`/`fossil changes` detection.
- The on-demand `getFileHunks` per-file diff (already O(1 file)).
- A true content-addressed store or cross-session sharing.

## Decisions

### Decision 1: Per-tree, per-session persisted manifest `path → { size, mtime, hash }`

On scan, for each non-excluded file:
- `stat` it. If a manifest entry exists with matching `size` **and** `mtimeMs`, reuse its `hash` — **no read**.
- Otherwise read, hash, and write the entry.
Build a fresh manifest from this run (reusing matched entries) and persist it, so deletions naturally drop out. Compare the two trees' resulting `path → hash` maps to produce the delta — identical semantics to today's content compare.

Hash: reuse the existing MD5 (already a dependency-free `crypto` hash); the cost that matters is the read it lets us skip, not the hash algorithm.

### Decision 2: The manifest is a cache — correctness never depends on it

A missing, unreadable, or corrupt manifest causes a full read+hash (today's behavior) and is then rebuilt. This keeps the optimization safe: worst case is "as slow as now," never wrong. Load/parse errors are swallowed and treated as an empty manifest.

### Decision 3: Storage location outside the scanned trees

Persist each manifest under the **session directory** (the parent of both `upstreamPath` and `agentWorkspacePath`), e.g. `<sessionDir>/.manifests/<treeBasename>.json`, alongside how patches are already stored at `<sessionDir>/patches`. Storing outside the trees means the manifest files are never seen by the scan (no self-referential changes) and need no special exclusion. Keyed by tree so the upstream and agent manifests stay separate.

### Decision 4: Extend the filesystem abstraction with `mtimeMs`

Add `mtimeMs: number` to the `stat`/`statAsync` (and `lstat`/`lstatAsync` for symmetry) result types in `os/types.ts`, and populate it in `node-adapter.ts` from Node's `Stats.mtimeMs`. Test fakes that construct stat results gain the field. The `async-filesystem` spec describes `stat` as returning "file statistics" generically, so this is an additive extension, not a contract change.

### Decision 5: Invalidate the upstream manifest after a commit

A successful commit mutates the upstream checkout (`applySelectedFiles` copies/【unlinks】 files). The copied files get fresh mtimes, so the stat check would self-heal — but to be unambiguous and to cover edge cases, `CommitService` deletes the upstream manifest on a successful commit (next to the existing cache invalidation). The next preview rebuilds it. One post-commit preview pays full cost; subsequent ones are fast.

## Risks / Trade-offs

- **Same size + same mtime + different content** → missed change. Mitigation: identical to git's racy-clean assumption; editing a file updates mtime, so this is vanishingly rare. The on-demand `getFileHunks` always reads real content, so an expanded file still shows the true diff.
- **Coarse-grained mtime on some filesystems** → conservative only in the wrong direction would be a problem, but coarse mtime means "looks unchanged" only when mtime genuinely didn't tick; a write within the same coarse tick also changes size in most real edits. Accept, consistent with git.
- **Concurrent previews of the same session** racing on the manifest file. Mitigation: write atomically (temp file + rename); the manifest is a cache so last-write-wins at worst causes a few extra reads, never incorrect results.
- **Stale manifest after out-of-band changes** → self-corrects on the next scan via stat; never produces a wrong delta because hashes are only reused on exact stat match.

## Migration Plan

- Purely additive and internal; no data migration. Existing sessions simply have no manifest on first preview and build one.
- Rollback: remove the manifest read/write and the `mtimeMs` usage; `detectChangedFiles` reverts to always reading size-equal files.

## Open Questions

- Manifest serialization: plain JSON object vs. a compact array form — JSON is simplest; revisit only if manifest size becomes a concern for very large trees.
- Should the agent-workspace manifest also be proactively invalidated in any flow other than stat self-healing? (Believed unnecessary — the agent workspace only changes via the agent writing files, which moves mtime.)
