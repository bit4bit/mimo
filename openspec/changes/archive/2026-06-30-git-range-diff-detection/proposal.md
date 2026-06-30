## Why

Even after the stat-first/manifest fixes, change detection on large repositories is fundamentally **O(repository size)**, not O(changed): every preview and every impact refresh `stat`s every non-excluded file across **two full working trees** (`upstream/` and `agent-workspace/`), and the first scan of a fresh session reads all source content. On big monorepos this still shows up as: the changed-files list timing out / not rendering, and the impact buffer's changed-files taking minutes to appear.

The platform is hand-reimplementing `git diff` by brute-force comparing two directory copies — reconstructing information **git already holds exactly**. The agent's work arrives in `agent-workspace` as **git commits** layered on the seeded "Initial import" commit, and `agent-workspace` is a git checkout for **every** repo type (fossil upstreams are funneled through `fossil import --git` + `git init --bare` seeding, so the agent and the platform mirror only ever speak git). Therefore the `upstream → agent-workspace` delta is exactly a git commit-range:

```
git diff --name-status <baseline>..HEAD        # changed-file list — O(changed), from git's object store
git diff               <baseline>..HEAD -- f    # hunks for file f — O(file)
```

No second working tree, no manifest, no full-tree `stat` walk, no `--no-index --binary`.

## What Changes

- Compute the commit preview's changed-file list, per-file hunks, and the impact buffer's changed-file set from a **native git commit-range diff in `agent-workspace`** (`<baseline>..HEAD`), replacing the two-tree `detectChangedFiles` filesystem scan and its manifest store for these read paths.
- Introduce an explicit, persisted **`baseline` ref** per session in `agent-workspace`'s git, initialized to the seeded "Initial import" commit, representing "current upstream state." After a selective commit, advance `baseline` so just-committed files drop out of the next preview (preserving today's two-endpoint semantics without a divergent second tree).
- Keep `getFileHunks` on demand; source the "before" bytes from `git show <baseline>:<path>` (the seeded blob is present even in the `--depth=1` checkout) instead of reading the `upstream/` working tree.
- Scope strictly to **detection/preview/hunks/impact** (reads of `agent-workspace`). The **upstream-persist hop** (`applySelectedFiles` → `commit` → `push`, which branches on `repoType`) is **unchanged**; this change works identically for git and fossil upstreams because it only reads `agent-workspace`, which is always git.
- Resolve the `upstream/` working tree's remaining role: if its only consumers were detection (now git-range) and the commit staging copy (`applySelectedFiles` target), evaluate whether to retire the second full checkout entirely (large disk/scan win) or keep a minimal staging area. (See design — kept as an explicit open decision.)
- Replace the synchronous `fs.exists` loop in the impact calculator (`calculator.ts`) with the git-range result and async I/O.

## Capabilities

### Modified Capabilities
- `commit-preview`: The `upstream → agent-workspace` delta and per-file hunks are computed from a native git commit-range diff (`<baseline>..HEAD`) in the agent workspace, with a persisted session baseline ref, rather than a two-tree filesystem scan. Two-endpoint semantics (including selective commit) and on-demand hunks are preserved.

### New Capabilities
- `impact-change-detection`: The impact buffer's changed-file set is sourced from the same git commit-range diff, so impact metrics scale with the number of changed files rather than repository size.

## Impact

- **`packages/mimo-platform/src/domain/commits/service.ts`**: `getPreview`/`getFileHunks` use the git-range diff + `baseline` ref; the manifest store and two-tree `detectChangedFiles` call are removed from the preview path.
- **`packages/mimo-platform/src/domain/vcs/index.ts`**: new git-range helpers (`diffNameStatus(workspace, baseRef)`, `diffFileRange(workspace, baseRef, path)`, `showFileAtRef`, baseline ref read/advance). These are git-only and live in the vcs layer (not the commit domain), consistent with `agent-workspace` always being git.
- **`packages/mimo-platform/src/domain/impact/calculator.ts`**: changed-file detection sourced from the git-range result; remove the two-tree `detectChangedFiles` fallback and the synchronous `fs.exists` loop.
- **`packages/mimo-platform/src/domain/files/changed-files.ts` / `tree-manifest.ts`**: two-tree scan + manifest retired for these read paths (kept only if another consumer remains).
- **Session lifecycle**: record/advance the `baseline` ref at session seed and after each successful selective commit (next to existing cache invalidation).
- **`upstream/` working tree**: role reduced to (at most) the commit staging target; possible retirement evaluated separately.
- **No change to clone/propagation or to fossil/git commit & push** — the agent still `git clone`s the served `<sid>.git`, still `git push`es; the platform still `git pull`s into `agent-workspace`; the upstream-persist hop is untouched.
- **Depends on / sequences after** `fix-commit-push-bigrepo` (commit path off the whole-tree patch) and benefits from `replace-fossil-with-git`, but is **not blocked** by fossil removal.
- **Tests**: new git-range detection tests; selective-commit baseline-advance tests; parity tests showing identical changed-file sets for git and fossil upstream sessions; impact tests asserting O(changed) detection.
