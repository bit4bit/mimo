## Context

The commit preview answers one question: *what would committing introduce upstream?* Concretely, it is the delta between two sibling working directories under the session dir — the platform's `upstream/` checkout (the "before", what gets committed and pushed) and the `agent-workspace/` (the "after", where the agent edited).

Today both `CommitService.getPreview` and `getFileHunks` obtain that delta via `getCachedPatch` → `VCS.generatePatch`, which shells out to:

```
git diff --binary --no-index --no-color -- <upstreamDir> <agentDir>
```

`--no-index` makes git diff two arbitrary directories as plain trees — chosen historically because it is backend-neutral (works whether the session is git or fossil). But that neutrality is the wrong kind: it discards the one thing that could make the diff cheap (a VCS index/stat-cache) and, critically, it **ignores pathspecs, `.gitignore`, and exclusions**. So it recursively walks *both entire trees* — including `upstream/.git` (hundreds of MB of pack files on a real repo) and `node_modules` — and `--binary` base85-encodes every differing/added/deleted blob into one giant patch string. `filterVcsMetadata()` then discards the excluded entries in Node, *after* the cost was already paid. Empirically, for one changed file in a 500-file repo, 525 of 526 diff entries were `.git` internals.

Constraints:
- The repository still supports both `git` and `fossil` (`repoType: "git" | "fossil"`). The fix must not change fossil behavior and must not make the domain depend on git.
- The preview's *endpoint* must stay `upstream → agent-workspace`. A single-checkout native status (`git status` / `fossil changes`) is **not** equivalent: after a selective commit, `applySelectedFiles` copies files agent→upstream and commits upstream **without touching the agent workspace**, so the agent's own baseline diverges from upstream and a single-checkout status would re-list files already committed upstream.

## Goals / Non-Goals

**Goals:**
- Make the commit preview cost scale with the number of changed files plus a stat of the tracked tree, not with repository/history size or binary content.
- Never traverse, read, or encode `.git`/`_FOSSIL_`/excluded/ignored paths during the preview.
- Preserve exact two-endpoint semantics (`upstream → agent-workspace`), including the selective-commit case.
- Keep the preview path VCS-agnostic; fossil benefits identically and the domain gains no git dependency.

**Non-Goals:**
- True `O(changed)` detection via a persisted upstream-tree index/manifest. Out of scope unless `O(N stats)` proves too slow on real repos.
- Changing the git/fossil **commit & apply** paths, which legitimately need the `--binary` patch (`generatePatch` stays for them).
- Changing how the agent syncs, or anything in `replace-fossil-with-git`.

## Decisions

### Decision 1: Replace `git diff --no-index` (preview path only) with a filtered, size-first, VCS-agnostic two-tree walk

Walk `upstream/` and `agent-workspace/` directly in TypeScript via the existing exclusion-aware `scanDirectory` (which already does `if (isExcluded(entry.name)) continue;`, so it never descends into `.git`/`_FOSSIL_`/etc.), comparing by path:
- A path present only in the workspace → `added`; only in upstream → `deleted`. No content read.
- A path present on both sides with **differing size** → `modified`. No content read.
- A path present on both sides with **equal size** → content-compared with an early-exit byte comparison to decide modified-vs-unchanged. This is the only case that reads content.
- Exclusion is handled by `scanDirectory` via the centralized `EXCLUDED_PATHS` policy (now including `node_modules`). Full `.gitignore`/`.mimoignore` glob honoring is out of scope (no existing matcher; not honoring it is no regression from today's `--no-index`).
- Use the async filesystem adapter (`os.fs.existsAsync`/`statAsync`/`readFileAsync`, mirroring `detectChangedFilesFromPatchPreviewAsync`) so the event loop is not blocked.

This is effectively the pre-existing `detectChangedFiles` two-tree scan (which already excludes VCS internals) made **size-first** so content is read only for size-equal candidates rather than MD5-hashing every file.

**Why content is still read for size-equal files:** across two independent trees with no shared index, two equal-size files cannot be proven identical without reading them, and unchanged files always have equal size. The eliminated cost is traversing/encoding `.git` (525/526 of the work today) and the whole-repo `--binary` patch — not reading source. True `O(changed)` would require a persisted upstream manifest or VCS-native status (see Non-Goals / Decision 5).

**Why not switch the preview to git-native `git diff`?** It would break the fossil backend and leak a git dependency into the domain. **Why not single-checkout `git status`/`fossil changes`?** Wrong endpoint — diverges from upstream after selective commits. A direct filesystem compare is the only option that is simultaneously two-endpoint-correct, backend-neutral, and cheap enough.

### Decision 2: `getPreview` / `getFileHunks` consume the stat-diff, not a parsed patch

`CommitService.getPreview` builds its `files` list and `summary` from the stat-diff result instead of `parsePatchPreview(patch)`. The shared `changedFilesCache` (consumed by impact analysis) is still populated from the same result, preserving the existing reuse contract. The 30s patch cache (`patchCache`) is retained only for the commit/apply path.

### Decision 3: Hunks remain on-demand and are computed per file

`getFileHunks(sessionId, filePath)` reads *only* the two versions of the requested file and produces its hunks. This can reuse the existing unified-diff representation (`DiffHunk`) by generating a per-file diff. Generating per-file content can stay backend-neutral (compute the diff from the two file contents directly) so it does not reintroduce a git dependency. The initial preview response continues to omit hunks (already the case today).

### Decision 4: Add `node_modules` (and common build/dependency dirs) to the exclusion policy

`node_modules` is currently absent from `EXCLUDED_PATHS`, so today it is both walked and surfaced as changed files. Adding it (plus candidates like `dist`, `build`, `.next`, `target` — to be confirmed) makes the preview correct and faster. This is a centralized, backend-neutral policy change, so it benefits commit detection consistently. **Open** whether to gate build-dir exclusion behind `.gitignore` instead of hardcoding.

## Risks / Trade-offs

- **Reads content of size-equal files** → Unchanged files (which are size-equal) are read to confirm they are unchanged, so the preview is `O(source bytes)`, not `O(changed)`. Mitigation: this is bounded source content read with early-exit byte compare, async to avoid blocking the loop; the eliminated cost (`.git` traversal + `--binary` encoding) was the catastrophic part. The persisted-manifest / VCS-native follow-up (non-goal) closes the remaining gap if needed.
- **Excluding build dirs could hide intended changes** → If a project legitimately commits a `dist/`, a hardcoded exclusion would hide it. Mitigation: prefer `.gitignore`-driven exclusion; keep the hardcoded set minimal (`node_modules`).

## Migration Plan

- Pure internal refactor of the preview path; no data migration, no API shape change (`CommitPreviewResult` / `FileHunksResult` unchanged).
- `generatePatch` (`--no-index --binary`) remains for commit/apply, so the commit flow is untouched.
- Rollback is reverting the preview path to `getCachedPatch` + `parsePatchPreview`.

## Open Questions

- Which build/dependency dirs (beyond `node_modules`) belong in the exclusion policy, vs. relying solely on `.gitignore`?
- For size-equal files, is mtime sufficient, or should the size-equal subset be content-hashed for correctness?
- Does any consumer of `getPreview` rely on `isBinary` per file? If so, how is binary status determined without the `--binary` patch (e.g., NUL-byte sniff on demand)?
