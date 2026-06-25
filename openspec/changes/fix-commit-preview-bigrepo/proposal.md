## Why

The commit preview is unusably slow on large repositories — it can take seconds or time out even when a single file changed. The root cause is `VCS.generatePatch()` (`packages/mimo-platform/src/domain/vcs/index.ts:1684`), which runs `git diff --binary --no-index -- <upstreamDir> <agentDir>`. `--no-index` recursively walks **both entire working trees** — including `upstream/.git` and `node_modules` — and `--binary` base85-encodes every differing/added/deleted blob, producing a giant patch string that `filterVcsMetadata()` then discards line-by-line. (Verified: for a single changed file, 525 of 526 diff entries were `.git` internals.) Cost scales with repository and history size, not with how much changed.

## What Changes

- Replace the `git diff --binary --no-index` whole-tree handoff in the **commit preview path** with a filtered, stat-first, **VCS-agnostic two-tree comparison** between `upstream/` and `agent-workspace/`.
- The preview computes its changed/added/deleted file list from filesystem `stat` (size + mtime) only, reading **no file content** for unchanged files, and skipping `EXCLUDED_PATHS` (`.git`, `_FOSSIL_`, `.fossil*`, etc.) and `.gitignore`/`.mimoignore` patterns during the walk.
- Per-file diff hunks remain fetched **on demand** (`getFileHunks`) only when a file is expanded — content is read solely for the requested file.
- The comparison stays a genuine **two-endpoint delta** (`upstream → agent-workspace`), preserving today's semantics: a file already committed upstream no longer appears as pending, even though the agent workspace still differs from its own baseline.
- Decide whether `node_modules` (and common build/dependency dirs) should join the excluded set, since it is currently walked and surfaced as changed files.
- The git/fossil **commit and apply** paths (which legitimately need the `--binary` patch) are left unchanged.

## Capabilities

### New Capabilities
- `commit-preview`: How the platform computes the set of changes that committing would introduce upstream (the `upstream → agent-workspace` delta), independent of the VCS backend, and how per-file diffs are fetched on demand.

### Modified Capabilities
<!-- No existing capability owns commit-preview behavior; the only preview requirement in vcs-integration is the unrelated merge preview. -->

## Impact

- **`packages/mimo-platform/src/domain/vcs/index.ts`**: preview no longer uses `generatePatch` (`--no-index --binary`); `generatePatch` retained for commit/apply only.
- **`packages/mimo-platform/src/domain/commits/service.ts`**: `getPreview` / `getFileHunks` use the new filtered two-tree comparison instead of `getCachedPatch` + `parsePatchPreview`.
- **`packages/mimo-platform/src/domain/commits/changed-files.ts`** / **`patch-preview.ts`**: changed-file detection sourced from the stat-diff rather than a parsed patch.
- **`packages/mimo-platform/src/domain/files/path-policy.ts`**: possible addition of `node_modules`/build dirs to `EXCLUDED_PATHS`.
- **No impact on Fossil behavior or on git-only assumptions** — the preview path becomes pure filesystem logic, so both backends benefit and the domain gains no direct git dependency.
- **Tests**: `packages/mimo-platform/test/commit-preview-performance.test.ts` extended to assert `.git`/excluded dirs are never walked and that the two-endpoint semantics hold after a selective commit.
