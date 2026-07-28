## Context

The session page renders buffers in two frames via `buffers/registry.ts` + `Frame.tsx`. Existing diff/change surfaces:

- **FileTree buffer** (right frame) — collapsible tree of *all* workspace files, highlights changed files; no diff view. Omits deleted files.
- **Commit buffer** (left frame) — flat list of changed files with per-file diffs and commit actions; uses `diff-navigation` overview track. The diff is sourced from `<baseline>..HEAD` where `baseline` *advances* after selective commits, so it shows only uncommitted work.
- **Patch buffer** (left frame) — per-file vertical-split diff for expert-mode replacements; transient, one file at a time.
- **Impact buffer** (right frame) — metrics and a flat changed-file list.

There is no persistent surface that shows the **full diff of the agent's work for the session** — everything between the original clone state and the current HEAD — in a GitHub-style tree-on-left, diff-on-right layout.

The agent workspace is always git (every repo type is funneled through git at the agent boundary). Its history starts at a seeded "Initial import" root commit (no parents), layered with the agent's commits. The `vcs` layer already exposes `diffNameStatus(workspace, baseRef)` and `diffFileRange(workspace, baseRef, path)` helpers (introduced by `git-range-diff-detection`) that answer `git diff <baseRef>..HEAD` from git's object store in O(changed).

The existing `baseline` ref (persisted on `session.baseline`) is advanced after selective commits so committed files drop out of the commit preview. It cannot serve a "show everything the agent did" review — by design it shrinks.

## Goals / Non-Goals

**Goals:**
- Add a **Review buffer** in the left frame (alongside Edit, Patches, Commit) that renders an internal horizontal split: a tree of *only changed files* (added/modified/deleted, grouped by directory, with status badges) on the left pane, and a unified diff of the selected file on the right pane.
- Source the diff from `git diff <root-commit>..HEAD` in the agent workspace, where the root commit is the seeded base commit with no parents — resolved on demand via `git rev-list --max-parents=0 HEAD`. This is **independent** of the `baseline` ref and requires **no new persisted session state**.
- Include deleted files in the tree (unlike the FileTree buffer) and show them with a `-` badge; selecting a deleted file shows its removal diff.
- Render the unified diff with the existing `diff-navigation` overview track (`MIMO_DIFF_OVERVIEW`) and `.diff-line--added/removed/context` styling.
- Refresh **manually** via a button; no polling, no websocket subscription, no lazy-on-activation refresh.
- Reuse the existing `vcs.diffNameStatus` and `vcs.diffFileRange` helpers (calling them with the root commit) and the existing `FILE_STATUS_META` badges — no new diff engine, no new styling vocabulary.

**Non-Goals:**
- Review-state tracking (mark files as reviewed), line-level comments, or any PR-workflow features. This is a *diff browser*, not a review workflow.
- Replacing the Commit buffer, FileTree buffer, or Patch buffer. Each keeps its own scope.
- Depending on `git-range-diff-detection`'s `baseline` ref or its persisted state. The Review resolves its own root commit independently.
- Polling or live updates. The diff reflects HEAD at the moment of the last manual refresh.
- Cross-session or cross-branch comparison. Single session, single root-commit..HEAD range.

## Decisions

### D1: Diff source is `git diff <root-commit>..HEAD`, resolved independently of `baseline`

The Review shows the agent's complete work for the session — the delta between the original source-branch state (the seeded root commit) and the current agent-workspace HEAD. This is distinct from the Commit preview's `<baseline>..HEAD`, where `baseline` advances after selective commits and the range shrinks.

```
ROOT (seed, no parents)   ◄── git rev-list --max-parents=0 HEAD
  │
  ├── agent commit 1      ◄── all of this shows in Review
  ├── agent commit 2
  ▼
HEAD

BASELINE (advances)       ◄── used by Commit preview; NOT used by Review
  │
  ▼
HEAD
```

The root commit is the commit with no parents — the seeded "Initial import" — and it never moves (it is the history root). Resolve it on demand per request via `git rev-list --max-parents=0 HEAD`. No persisted session field, no dependency on `git-range-diff-detection`, no migration.

**Rationale:** The existing `baseline` ref cannot serve this use case by construction (it advances). Introducing a second persisted ref would duplicate state for no benefit when git history already records the root unambiguously. Resolving on demand keeps the Review fully independent of the commit-preview machinery and its lifecycle.

**Alternatives considered:**
- *Persist a `seed` ref on the session, set once at seed time, never advanced:* would work and would avoid the `rev-list` call per request, but adds a new persisted field, a new write site, a backfill migration for existing sessions, and a new correctness invariant — all to cache a value git already holds exactly. Not worth it.
- *Reuse `baseline` and accept that it advances:* wrong semantics — the Review would lose committed files from view, contradicting its purpose.
- *Compare against the remote `sourceBranch` tip (live upstream):* would show divergence from upstream rather than the agent's total work, and would require a network fetch per refresh. Out of scope for this change.

### D2: Reuse existing `vcs.diffNameStatus` and `vcs.diffFileRange` with the root commit

The `vcs` layer already exposes:
- `diffNameStatus(workspace, baseRef)` → `git diff --name-status --no-renames -z <baseRef> HEAD` → changed-file list with status.
- `diffFileRange(workspace, baseRef, path)` → `git diff --no-color <baseRef> HEAD -- <path>` → per-file unified-diff patch text.
- `showFileAtRef(workspace, ref, path)` → `git show <ref>:<path>` → file bytes at a ref (not needed here; `diffFileRange` is sufficient).

Call both with `baseRef = rootCommit`. No new git plumbing, no new domain logic. The existing `parsePatchPreview` (in `domain/commits/patch-preview.ts`) parses the patch text into `DiffHunk[]` for rendering — reuse it for the per-file diff response.

**Rationale:** These helpers are git-only and live in the vcs layer, which is correct because `agent-workspace` is always git. The Review is a read-only consumer; it adds no new git operations.

**Alternatives considered:**
- *Add a `ReviewService` domain service wrapping the vcs calls:* thin pass-through with no domain logic of its own. The REST handler can resolve the root commit and call `vcs` directly, mirroring how `files.ts` resolves the workspace path and calls `fileService` directly. A service layer is warranted only if the Review grows domain rules (e.g., filtering, review-state persistence) — none are in scope.

### D3: New `vcs.resolveRootCommit(workspace)` helper

A single new method on the VCS interface:

```ts
async resolveRootCommit(workspacePath: string): Promise<string | null>
```

Implementation: `git rev-list --max-parents=0 HEAD` (returns the first root commit SHA, or null if the workspace has no commits). Lives in `domain/vcs/index.ts` alongside the other git-range helpers. Pure read, no writes, no persisted state.

**Rationale:** The root-commit resolution is a git operation and belongs in the vcs layer with `diffNameStatus`/`diffFileRange`. Keeping it in vcs (rather than inlining `rev-parse` in the REST handler) makes it testable in isolation and reusable if any other consumer needs the session root.

### D4: Buffer placement in the left frame, after Commit

Register `review` in `buffers/index.ts` with `{ id: "review", name: "Review", frame: "left" }`, positioned immediately after the `commit` registration. The left-frame tab order becomes: Chat, Terminal, Edit, Patches, Commit, Review.

**Rationale:** The Review's internal layout (file tree + diff) needs the width of the left frame (flex: 2 of the page). The right frame (flex: 1) is too narrow for a usable horizontal split. Placing it after Commit groups the diff-oriented buffers (Edit, Patches, Commit, Review) together in the left frame, matching the existing pattern.

**Alternatives considered:**
- *Right frame:* too narrow for tree + diff side by side.
- *Full-width overlay/modal:* breaks the buffer model and the persisted frame-state; the Review is a persistent surface, not a transient dialog.
- *Left frame, before Commit:* Commit is the action-oriented buffer (commit message + push); Review is the read-oriented buffer. Reading-then-acting flows better with Review before Commit, but the existing tab order (Chat, Edit, Patches, Commit) is action-sorted, and Review is a passive browser — placing it last keeps the action buffers clustered.

### D5: Internal horizontal split — file tree left, unified diff right

The Review buffer renders a single panel that contains a horizontal split:

```
┌─ Review buffer (left frame) ─────────────────────────────┐
│  [↻ Refresh]                              +12  -8  5 files │
│  ┌──────────────┬───────────────────────────────────────┐ │
│  │ ▾ src/auth/  │  src/auth/session.ts                  │ │
│  │   + session  │  ────────────────────────────────────  │ │
│  │   ~ tokens   │   42  + import { verify } from ...    │ │
│  │   - old-api  │   43  - const oldToken = ...           │ │
│  │ ▾ test/      │   44  + const token = await ...        │ │
│  │   ~ auth.tst │                                       │ │
│  │              │  [overview track ►]  2 / 5 changes      │ │
│  └──────────────┴───────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- Left pane: tree of changed files only, grouped by directory, with `+`/`~`/`-` status badges. Directories collapsible; auto-expand ancestors of changed files on first render (reuse `computeExpandedPaths` from `file-tree.js`). Deleted files appear as leaf nodes with a `-` badge (unlike the FileTree buffer, which omits them).
- Right pane: unified diff of the currently selected file, rendered with `.diff-line--added/removed/context` and the `MIMO_DIFF_OVERVIEW` overview track. Binary files render a "Binary file changed" placeholder. Empty state (no file selected): "Select a file to view its diff."

**Rationale:** This is the GitHub PR review layout. The buffer model gives us a single panel; the split is internal to the buffer's content area, so it composes with the existing frame/tab machinery without changes to `Frame.tsx` or the registry shape.

**Alternatives considered:**
- *Two separate buffers (tree in right frame, diff in left frame):* would require cross-frame coordination (selecting a file in the right-frame tree would need to switch the left-frame diff), which the buffer model does not support today. A single buffer with an internal split is simpler and self-contained.
- *Vertical split (tree on top, diff below):* worse use of the wide left-frame width; the tree is narrow and the diff is short. Horizontal split matches the GitHub layout and the available width.

### D6: Tree of changed files only, including deleted files

The tree is built **client-side** from the `/review` response's `files` array (not from the full `/files` list). Each entry has `{ path, status }` where `status` is `added` | `modified` | `deleted`. All three statuses render as leaf nodes; deleted files are included with a `-` badge.

Reuse `buildTree` from `file-tree.js` but adapt the input shape: the `/review` response has `{ path, status }` (no `name`/`size`); derive `name` as the last `/` segment. The `mergeChangedStatus` filter step is unnecessary because every entry is already a changed file — build the tree directly from the changed-files list.

**Rationale:** The FileTree buffer's `mergeChangedStatus` omits deleted files because it intersects a full-file tree with the changed-files set and deleted files are not present in the working tree. The Review starts from the changed-files set directly, so deleted files are first-class entries. This is the key behavioral difference from the FileTree buffer's tree.

**Alternatives considered:**
- *Reuse `buildTree` + a modified `mergeChangedStatus` that keeps deleted entries:* would require changing the existing helper or adding a parallel one. Building directly from the changed-files list is simpler and avoids coupling to the FileTree buffer's full-file-tree assumption.

### D7: Manual refresh only — no polling, no lazy-on-activation

The Review buffer refreshes **only** when the user clicks the Refresh button (the `↻` affordance in the buffer header). No `setInterval`, no websocket subscription, no re-fetch on `isActive` transitions.

**Rationale:** The diff changes only when the agent commits (advancing HEAD) or when the user manually commits via the Commit buffer. Polling would add load for no interactive benefit — the user knows when they've committed. Lazy-on-activation would refresh on every tab switch, which is wasteful for a read-only browser. A manual button gives the user explicit control, matching the "review" mental model: look at the state, refresh when you want an update.

**Alternatives considered:**
- *Lazy refresh on activation (like FileTree/Commit):* reasonable but noisier than necessary; the user typically opens the Review to look, not to get the latest. Manual is calmer.
- *Websocket subscription to `"files"` channel:* would require new server-side fan-out for commit events. Out of scope.

### D8: New REST endpoints under `/api/sessions/:sessionId/review`

Two new routes (mounted on the sessions router, next to the existing `/files` routes):

- `GET /api/sessions/:sessionId/review` → resolve root commit via `vcs.resolveRootCommit(agentWorkspacePath)`; call `vcs.diffNameStatus(agentWorkspacePath, rootCommit)`; parse the `--name-status` output into `{ files: [{path, status}], summary: {added, modified, deleted} }`.
- `GET /api/sessions/:sessionId/review/files/*path` → resolve root commit; call `vcs.diffFileRange(agentWorkspacePath, rootCommit, path)`; parse via `parsePatchPreview` into `{ hunks: DiffHunk[], isBinary: boolean }`.

Both resolve the agent-workspace path from the session (same `getWorkspacePath` resolver the `/files` routes use). Both return 404 `{ error: "Session not found" }` for an unknown session. The `*path` param captures slash-containing file paths.

**Rationale:** Mounting under `/api/sessions/:sessionId/review` keeps the Review's routes namespaced and discoverable, parallel to the existing `/files` sub-routes. The `*path` wildcard is necessary because file paths contain `/` and the existing `/commits/:sessionId/files/:filePath/hunks` route (single `:filePath` param) does not capture slashes — the Review must handle nested paths.

**Alternatives considered:**
- *Reuse `/commits/:sessionId/preview` + `/commits/:sessionId/files/:filePath/hunks`:* these use `baseline` (advancing), not the root commit. Wrong semantics.
- *Query-param path (`?path=...`) instead of `*path` wildcard:* works but the wildcard is more RESTful and matches the resource hierarchy.

### D9: Styling and CSS reuse

Reuse the existing CSS classes from the Commit buffer and FileTree buffer:
- `.tree-node`, `.tree-node-row`, `.tree-toggle`, `.tree-children`, `.tree-label` (from FileTree/Commit)
- `.file-status--added`, `.file-status--modified`, `.file-status--deleted` (from Commit)
- `.diff-hunk`, `.diff-hunk-header`, `.diff-line`, `.diff-line--added`, `.diff-line--removed`, `.diff-line--context`, `.diff-binary` (from Commit)
- `.file-diff`, `.file-diff-header`, `.file-diff-title`, `.file-diff-body` (from Commit)

New CSS (minimal): the horizontal-split container (`.review-split`, `.review-tree-pane`, `.review-diff-pane`) and the refresh button (`.review-refresh-btn`). All within the existing dark-theme variables.

**Rationale:** The Commit buffer already renders identical diff hunks with the same classes. Reusing them keeps the visual language consistent and avoids a second diff stylesheet.

## Risks / Trade-offs

- **[Root commit resolution on every request]** → `git rev-list --max-parents=0 HEAD` is a trivial git operation (reads the commit graph root, O(1) in practice). If it ever shows up in profiling, cache the root SHA per session in memory on the server (TTL'd) — but do not persist it; the root never moves for a given session. Mitigation: measure first; the call is cheap.
- **[Shallow clones and root-commit availability]** → `agent-workspace` is cloned with `--depth=1` in `clonePlatformCheckout`, but the seeded "Initial import" commit is the root and is present in the shallow clone (it is the only commit at clone time; the agent's commits layer on top). `git rev-list --max-parents=0 HEAD` will find it. Mitigation: a test asserting the root is resolvable on a `--depth=1` clone seeded the same way the platform seeds it.
- **[Large diffs in the browser]** → a file with thousands of changed lines could produce a large hunk response and a heavy DOM. Mitigation: the diff pane already exists in the Commit buffer with the same risk; the `diff-navigation` overview track assumes a scrollable diff. If this becomes a problem, cap the rendered lines and add a "show more" affordance — but defer until reported.
- **[No live updates]** → the Review can go stale while the agent commits in the background. Mitigation: the manual Refresh button is always visible; the header can show a subtle "last refreshed" timestamp if staleness becomes a complaint. Out of scope for v1.
- **[Deleted files with no working-tree content]** → selecting a deleted file must still show its removal diff. `vcs.diffFileRange(root, HEAD, path)` produces the diff from git's object store (the root blob is present), so the deleted file's former content is available. No special handling needed beyond rendering the resulting all-removal hunks.

## Migration Plan

Additive only — no existing behavior changes:

1. Ship `vcs.resolveRootCommit` + tests.
2. Ship the two `/review` REST endpoints + tests.
3. Ship `review.js` (client module: tree builder, diff renderer, refresh, overview track) + tests.
4. Ship `ReviewBuffer.tsx` + registration in `buffers/index.ts` + asset wiring.
5. No frame-state migration: the new buffer simply appears in the left-frame tab bar. Users with persisted `leftFrame.activeBufferId` are unaffected; the new tab is available on next page load.

Rollback: remove the `registerBuffer({ id: "review", ... })` call, the new routes, and the new client module. No data migration, no persisted state to clean up (the buffer carries no server-side state of its own; the root commit is derived on demand).

## Open Questions

- **Tab keybinding for the Review buffer:** the existing left-frame buffer-switch keybindings (`nextLeftBuffer`/`previousLeftBuffer`) cycle through all left-frame buffers, so the Review is reachable via those. Is a dedicated keybinding (e.g., `Mod+Shift+R`) desired for direct access? Defer until the shortcuts-help overlay is updated; not blocking.
- **Should the Review's tree remember its expand/collapse state across buffer switches?** The FileTree buffer does not persist tree state (it re-derives on activation). For consistency, the Review should also not persist — re-derive from the changed-files response on each refresh, auto-expanding changed-file ancestors. If users request it later, persisting the expanded-paths set in `localStorage` (keyed by session) is an additive follow-up.
- **Empty diff (no changes since root):** render an empty-state message ("No changes in this session yet") in both the tree pane and the diff pane. Confirm the wording during implementation.