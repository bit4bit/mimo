## Why

The session page has no persistent, GitHub-style review surface for browsing the full diff of an agent's work. The Commit buffer shows a flat file list (no tree), the FileTree buffer shows all files (no diff), and the Patch buffer is per-file and transient. Users want a persistent diff browser with a file tree on the left and a unified diff on the right — showing the complete delta between the session's current agent-workspace HEAD and the original source branch state the session was cloned from, refreshed manually.

## What Changes

- Add a new **Review buffer** registered in the left frame (alongside Edit, Patches, Commit), rendering an internal horizontal split: a file tree of **only changed files** on the left pane and a unified diff of the selected file on the right pane.
- The file tree shows **only changed files** (added, modified, deleted), grouped by directory, with `+`/`~`/`-` status badges — including deleted files (unlike the FileTree buffer).
- The diff pane renders a unified diff for the selected file with the existing `diff-navigation` overview track and `+`/`-` line highlighting; binary files show a "Binary file changed" placeholder.
- The diff comparison is `git diff <root-commit>..HEAD` in the agent workspace, where the root commit is resolved via `git rev-list --max-parents=0 HEAD` (the original seed commit, never advancing). This is **independent** of the `baseline` ref used by the commit preview — no new persisted session state, no dependency on `git-range-diff-detection`.
- New backend endpoints:
  - `GET /api/sessions/:sessionId/review` → `{ files: [{path, status}], summary: {added, modified, deleted} }`
  - `GET /api/sessions/:sessionId/review/files/*path` → `{ hunks, isBinary }`
- Refresh is **manual** (a refresh button); no polling, no websocket subscription, no lazy-on-activation refresh.

## Capabilities

### New Capabilities

- `review-buffer`: A left-frame buffer that renders a horizontal split — a tree of changed files (added/modified/deleted, grouped by directory, with status badges) on the left pane and a unified diff of the selected file on the right pane — sourced from a git commit-range diff between the session's root seed commit and the agent-workspace HEAD, with manual refresh.

### Modified Capabilities

- `frame-buffers`: Adds the Review buffer to the left-frame default set, registered after the `commit` buffer; extends the buffer registry with the new buffer.

## Impact

- **Frontend (new)**:
  - `packages/mimo-platform/public/js/review.js` — tree builder (changed-files flat → nested, including deleted entries), unified-diff renderer, manual refresh button, per-file diff fetch on selection, `MIMO_DIFF_OVERVIEW` overview-track wiring.
  - `packages/mimo-platform/src/web/features/sessions/components/buffers/ReviewBuffer.tsx` — server-rendered shell + hydration hook.
  - Register `review` in `buffers/index.ts` (left frame, after `commit`).
  - Embed `review.js` via `assets.ts` and `SessionDetailPage.tsx`.
- **Backend (new)**:
  - `GET /api/sessions/:sessionId/review` and `GET /api/sessions/:sessionId/review/files/*path` — new REST routes resolving the agent-workspace root commit via `vcs.resolveRootCommit`, then calling existing `vcs.diffNameStatus` and `vcs.diffFileRange` helpers.
  - `vcs.resolveRootCommit(workspace)` — new helper: `git rev-list --max-parents=0 HEAD`.
- **Reused (no change)**:
  - `domain/vcs/index.ts`: `diffNameStatus(workspace, baseRef)`, `diffFileRange(workspace, baseRef, path)` — called with the root commit instead of `baseline`.
  - `public/js/utils.js`: `FILE_STATUS_META`, `parsePatchPreview`/`DiffHunk` types.
  - `diff-navigation` spec: `MIMO_DIFF_OVERVIEW` module for the overview track.
  - CSS: `.diff-line--added/removed/context`, `.file-status--added/modified/deleted`, `.tree-node` classes from the Commit buffer and FileTree buffer.
- **No dependency on** `git-range-diff-detection` (the Review resolves its own root commit independently; the existing `baseline` ref is not used).
- **No new persisted session state** — the root commit is derived from git history on demand.
- **Tests**: new REST handler tests for `/review` and `/review/files/*path`; new unit tests for the client-side changed-file tree builder (including deleted-file nodes), unified-diff rendering, and manual refresh behavior.