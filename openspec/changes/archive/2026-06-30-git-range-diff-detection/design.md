## Context

Three slow paths on large repositories — the commit-preview file list, per-file hunks, and the impact buffer's changed files — share one root cause: the platform brute-force compares two full directory copies (`upstream/` and `agent-workspace/`) to reconstruct the set of changes. The stat-first comparison and the persisted `{size, mtime, hash}` manifest reduced the *content reads*, but the floor is still a full `stat` walk of both trees on every call, plus a full cold read on the first scan. Cost scales with repository size, not with how much changed.

The architecture already funnels every repo through git at the agent boundary:

```
  REMOTE (git or fossil)
     │  git clone   /   fossil import --git
     ▼
  upstream/  (git checkout  OR  fossil open)   ◄── the ONLY place fossil exists
     │  git init --bare + single "Initial import" commit  (seedSessionRepo)
     ▼
  <sid>.git  (bare, ALWAYS git)
     │  agent: git clone → edit → git commit → git push
     ▼
  agent-workspace/  (ALWAYS git; platform mirror, refreshed by git pull --ff-only)
```

So the agent's changes live in `agent-workspace` as **git commits** on top of the seeded "Initial import" commit — for *every* repo type. The `upstream → agent-workspace` delta the preview wants is therefore exactly a git commit-range, which git answers from its object store in O(changed):

```
git diff --name-status <baseline>..HEAD
git diff               <baseline>..HEAD -- <path>
git show               <baseline>:<path>          # "before" bytes for hunks
```

The two-tree filesystem scan was justified by VCS-agnosticism (must also work for fossil). But that agnosticism was paid in the wrong place: the layer being scanned (`agent-workspace`) is already git for all repo types. The fossil-specific work is isolated to the upstream-persist hop, which this change does not touch.

Constraints:
- Two-endpoint semantics (`upstream → agent-workspace`) must be preserved, including selective commit: a file copied to upstream and committed must not reappear as pending, even though `agent-workspace`'s own HEAD is unchanged by that commit.
- Clone and propagation must be unchanged (agent `git clone`/`git push`; platform `git pull --ff-only`).
- The git/fossil `commit`/`push` steps that persist to the upstream checkout must be unchanged.

## Goals / Non-Goals

**Goals:**
- Make preview, hunks, and impact change-detection **O(changed)**, sourced from git's object store in `agent-workspace`.
- Eliminate the two-tree full `stat` walk, the cold full-content read, and the per-tree manifest from these read paths.
- Preserve exact two-endpoint semantics including selective commit, for both git and fossil upstreams.
- Keep all fossil-specific logic confined to the (unchanged) upstream-persist hop.

**Non-Goals:**
- Changing clone/propagation or the `commit`/`push` steps.
- Honoring `.gitignore`/`.mimoignore` beyond what git already does (git's own exclusion applies natively now — a side benefit).
- Forcing fossil removal; this works with fossil upstreams today.

## Decisions

### Decision 1: A persisted per-session `baseline` ref defines "current upstream state"

`agent-workspace`'s git starts at the seeded "Initial import" commit. Record a session `baseline` ref initialized to that commit. The preview/impact delta is `git diff <baseline>..HEAD`. The `baseline` is the single source of "what is already upstream," replacing the role of the `upstream/` working tree as a diff endpoint. Persist it per session (alongside session state) so it survives restarts.

### Decision 2: Selective commit advances `baseline` for the committed paths

After a successful selective commit of paths `P` to the upstream checkout, the just-committed files must drop out of the next preview without touching `agent-workspace`'s HEAD. Resolve by advancing `baseline` so `baseline..HEAD` no longer reports `P`. Mechanism options (to finalize in implementation):
- **(a) Checkpoint commit**: create a commit in `agent-workspace`'s git that brings `P` to their committed content and move `baseline` to it (e.g., via a temporary index / `git commit-tree`), leaving the working tree and HEAD untouched.
- **(b) Per-path baseline map**: keep `baseline` plus a `path → committed-blob-sha` overlay for selectively-committed paths, and subtract those from the range result.

(a) keeps the model a pure two-ref range (simplest consumer); (b) avoids synthesizing commits. Decision deferred to a spike — both are git-only and backend-independent.

### Decision 3: Hunks come from `git show <baseline>:<path>` + working/HEAD content

`getFileHunks` stays on demand and computes the per-file diff from `<baseline>..HEAD` for that path (or `git show <baseline>:<path>` vs current content). The seeded blob is present in the `--depth=1` checkout, so no extra fetch is needed. This removes the dependency on the `upstream/` working tree for hunks.

### Decision 4: git-range helpers live in the vcs layer, not the commit domain

Because `agent-workspace` is always git, the new helpers (`diffNameStatus`, `diffFileRange`, `showFileAtRef`, baseline read/advance) are unambiguously git and belong in `domain/vcs`. The commit/impact domains call them through the vcs interface. This is *not* the "leak git into the domain" problem the preview fix avoided, because that concern was about the *backend-neutral* two-tree compare; here the target layer is git by construction for all backends.

### Decision 5: Evaluate retiring the `upstream/` working tree

Once detection and hunks no longer read `upstream/`, its only remaining consumer is `applySelectedFiles` (the commit staging copy: agent-workspace → upstream → commit). Options:
- **Keep** `upstream/` as the staging area (smallest change; commit path untouched; lose only the detection scan).
- **Retire** `upstream/` and stage selected paths via git plumbing into the bare repo / direct push (largest disk + scan win; bigger commit-path change — overlaps `fix-commit-push-bigrepo`).
Recommend shipping with **Keep**, then evaluating **Retire** as a follow-up once the range-diff detection is proven, to bound risk.

## Risks / Trade-offs

- **Baseline-ref bookkeeping is new state** that must stay correct across selective commits, session restart, and `git pull --ff-only` refreshes. Mitigation: derive it deterministically (seed commit + advance-on-commit), persist it, and cover with selective-commit + restart tests.
- **Empty/edge histories**: a brand-new session with no agent commits yet → `baseline..HEAD` is empty (correct: no changes). A force-push / non-ff agent history could move HEAD unexpectedly; `git pull --ff-only` already guards this.
- **Reintroduces git calls in read paths** — accepted and correct here (target layer is always git); confined to the vcs layer.
- **Two implementations transiently coexist** with the two-tree scan during migration. Mitigation: feature-flag or stage behind tests; remove the two-tree path once parity tests pass.

## Migration Plan

- Land after `fix-commit-push-bigrepo` so the commit path is already off the whole-tree patch.
- Add git-range helpers + baseline ref; switch `getPreview`/`getFileHunks`/impact detection to them behind parity tests; then remove the two-tree scan + manifest from these paths.
- No API shape change to `CommitPreviewResult`/`FileHunksResult`/impact results. No data migration beyond introducing the persisted baseline ref.
- Rollback: revert the read paths to `detectChangedFiles` (still present until the cleanup step).

## Open Questions

- **Baseline-advance mechanism** for selective commit: checkpoint commit (Decision 2a) vs per-path overlay (2b)? Spike both.
- What exactly is the seeded base commit's ref name, and is it stable across `git pull --ff-only` refreshes of `agent-workspace`? (Defines `baseline`'s initial value.)
- Keep vs retire `upstream/` (Decision 5) — ship Keep first?
- Any consumer of the current per-file `isBinary`/size metadata that git `--name-status` does not directly provide (size still available via `git cat-file -s` on demand if needed)?
