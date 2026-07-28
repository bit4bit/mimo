## 1. VCS root-commit helper

- [x] 1.1 Write failing test for `vcs.resolveRootCommit(workspacePath)` returning the root commit SHA (the commit with no parents) via `git rev-list --max-parents=0 HEAD`
- [x] 1.2 Write failing test for `resolveRootCommit` returning `null` when the workspace has no commits
- [x] 1.3 Write failing test asserting `resolveRootCommit` finds the seeded root commit in a `--depth=1` clone seeded the same way the platform seeds it (mirrors `clonePlatformCheckout` + `seedSessionRepo`)
- [x] 1.4 Implement `resolveRootCommit` in `domain/vcs/index.ts` alongside the existing git-range helpers (`diffNameStatus`, `diffFileRange`)
- [x] 1.5 Run `bun test` in `packages/mimo-platform`; confirm new tests pass and existing vcs tests still pass

## 2. Review REST endpoints

- [x] 2.1 Write failing test for `GET /api/sessions/:sessionId/review` returning `{ files: [{path, status}], summary: {added, modified, deleted} }` from a stubbed `vcs.resolveRootCommit` + `vcs.diffNameStatus`
- [x] 2.2 Write failing test for `GET /api/sessions/:sessionId/review/files/<path>` (path containing slashes) returning `{ hunks, isBinary }` from a stubbed `vcs.resolveRootCommit` + `vcs.diffFileRange` + `parsePatchPreview`
- [x] 2.3 Write failing test for session-not-found returning 404 `{ error: "Session not found" }` for both endpoints
- [x] 2.4 Write failing test for file-not-in-diff returning 404 `{ error: "File not found in review diff" }` for the per-file endpoint
- [x] 2.5 Write failing test asserting the file list uses the root commit (not `session.baseline`): stub `resolveRootCommit` to return a distinct SHA and assert `diffNameStatus` is called with that SHA, not the session's `baseline`
- [x] 2.6 Implement the `/review` and `/review/files/*path` routes in `api/rest/files.ts` (or `api/rest/sessions.ts`, matching where `/files` is mounted): resolve agent workspace path, resolve root commit, call `vcs.diffNameStatus` / `vcs.diffFileRange`, parse via `parsePatchPreview`, return JSON
- [x] 2.7 Wire the new routes into the sessions router mount point with access to `vcs` and the session path resolver (mirror the existing `/files` route wiring)
- [x] 2.8 Run `bun test` in `packages/mimo-platform`; confirm new tests pass and existing route tests still pass

## 3. Client-side tree builder (changed files only, including deleted)

- [x] 3.1 Write failing unit test for `buildChangedTree(changedFiles)` returning a nested `{ name, path, isDir, children?, status }[]` structure grouped by `/` segments, where every changed-file entry (added/modified/deleted) becomes a leaf node with its status
- [x] 3.2 Write failing unit test for `computeExpandedPaths(changedFilePaths)` returning the set of ancestor directory paths of every changed file (empty input → empty set)
- [x] 3.3 Write failing unit test asserting deleted files produce leaf nodes (unlike `file-tree.js:mergeChangedStatus`, which omits them)
- [x] 3.4 Implement `buildChangedTree` and `computeExpandedPaths` as pure functions in a new `public/js/review.js` module (no DOM mutation in the pure helpers)
- [x] 3.5 Run tests; confirm pure-function helpers pass

## 4. Tree rendering and interaction

- [x] 4.1 Write failing test for `renderTree(tree, { expandedPaths, onFileSelect })` producing DOM nodes where collapsed directories omit children and expanded directories render them
- [x] 4.2 Write failing test for a leaf click invoking `onFileSelect(path, status)` with the file's path and status
- [x] 4.3 Write failing test asserting status badges render: `+` with `file-status--added`, `~` with `file-status--modified`, `-` with `file-status--deleted`
- [x] 4.4 Implement `renderTree` in `review.js`: directory nodes toggle `expanded` on click and re-render children; leaf nodes use `FILE_STATUS_META` badges (reuse `utils.js` `FILE_STATUS_META` when available, fall back to a local copy for tests)
- [x] 4.5 Add `data-help-id` attributes to tree nodes and the Review tab button consistent with other buffers

## 5. Unified diff pane rendering

- [x] 5.1 Write failing test for `renderDiff(container, { hunks, isBinary })` rendering hunks with `.diff-line--added`, `.diff-line--removed`, `.diff-line--context` classes when `isBinary` is false
- [x] 5.2 Write failing test for `renderDiff` rendering a "Binary file changed" placeholder when `isBinary` is true
- [x] 5.3 Write failing test for `renderDiff` rendering "Select a file to view its diff" when no hunks are provided (empty state)
- [x] 5.4 Implement `renderDiff` in `review.js`: parse `DiffHunk[]` into diff-line DOM rows, apply line classes, render binary placeholder, render empty state
- [x] 5.5 Wire the `MIMO_DIFF_OVERVIEW` overview track (`diff-overview.js`) into the diff pane: collect hunks, create a controller, render the track alongside the diff body, support `nextChange`/`previousChange` keybindings when the Review buffer is active

## 6. Manual refresh and file selection

- [x] 6.1 Write failing test for the Refresh button click issuing `GET /api/sessions/:sessionId/review`, rebuilding the tree, and clearing the selected file (right pane returns to empty state)
- [x] 6.2 Write failing test for a file selection click issuing `GET /api/sessions/:sessionId/review/files/<path>` and rendering the returned hunks in the diff pane
- [x] 6.3 Write failing test asserting no fetches occur on buffer activation (no lazy refresh) and no polling while the buffer remains active
- [x] 6.4 Implement the Refresh button (`↻` affordance in the buffer header), the file-selection fetch, and the diff-pane update in `review.js`
- [x] 6.5 Implement the summary header (added/modified/deleted counts) above the split, updated on each refresh

## 7. Buffer component and registration

- [x] 7.1 Create `src/web/features/sessions/components/buffers/ReviewBuffer.tsx` — a server-rendered shell (container with `data-session-id`, `data-buffer-id="review"`) that mounts the client module; mirror `CommitBuffer.tsx` / `FileTreeBuffer.tsx` structure
- [x] 7.2 Register `review` in `buffers/index.ts` with `{ id: "review", name: "Review", frame: "left", component: ReviewBuffer }` positioned immediately after the `commit` registration
- [x] 7.3 Update `assets.ts` to embed `/js/review.js` and `SessionDetailPage.tsx` to include the `<script>` tag, matching how `commit-buffer.js` / `file-tree.js` are wired
- [x] 7.4 Export `ReviewBuffer` from `buffers/index.ts`

## 8. Styling and help IDs

- [x] 8.1 Add CSS for the horizontal split (`.review-split`, `.review-tree-pane`, `.review-diff-pane`), the summary header (`.review-summary`), and the refresh button (`.review-refresh-btn`) reusing existing dark-theme variables; ensure the tree reuses `.tree-node`/`.tree-toggle`/`.tree-children` classes and the diff reuses `.diff-hunk`/`.diff-line--*` classes from the Commit buffer
- [x] 8.2 Verify the Review tab appears in the left-frame tab bar after Commit and matches `Frame.tsx` tab styling
- [x] 8.3 Add help-tooltip entries for the Review buffer (tab button, tree nodes, refresh button, diff pane) consistent with other buffer help IDs

## 9. End-to-end verification

- [ ] 9.1 Manual: open a session with agent work, switch to the Review tab, confirm the tree shows only changed files (added/modified/deleted) grouped by directory with status badges
- [ ] 9.2 Manual: confirm directories start collapsed except ancestors of changed files; expand/collapse works on click
- [ ] 9.3 Manual: click a modified file → the right pane shows its unified diff with +/- highlighting and the overview track; click a deleted file → shows all-removal diff; click an added file → shows all-addition diff
- [ ] 9.4 Manual: click a binary file → the right pane shows "Binary file changed"; confirm no hunk rendering is attempted
- [ ] 9.5 Manual: click the Refresh button → the tree re-fetches and rebuilds; the diff pane clears to empty state; confirm no polling or auto-refresh on tab switches
- [ ] 9.6 Manual: confirm the Review shows all agent work since the session root commit, including files that were selectively committed (and thus no longer in the Commit preview)
- [x] 9.7 Run `bun run test.full` in `packages/mimo-platform`; confirm the full suite passes
- [x] 9.8 Run `bun run lint` and any typecheck command in `packages/mimo-platform`; resolve any issues

## 10. GitHub-style compare and compact tree

- [x] 10.1 Write failing component test for the Review buffer compare bar showing base branch → current branch with `initial`/`current` fallbacks
- [x] 10.2 Write failing integration assertion that the Review tree pane uses compact fixed-width CSS and reduced nesting indentation
- [x] 10.3 Implement the compare bar in `ReviewBuffer.tsx`, pass project/session branch props from `SessionDetailPage.tsx`, and add compare-bar styling/help text
- [x] 10.4 Reduce the Review tree pane width and indentation in `SessionDetailPage.tsx` CSS so the diff pane gets more space
- [x] 10.5 Run focused Review buffer tests, then `bun test`, `bun run typecheck`, and available lint checks for `packages/mimo-platform`
- [x] 10.6 Reduce Review tree depth indentation to one space (`1ch`) per level and update the compact-tree assertion
- [x] 10.7 Compact Review tree row chrome (row gap, toggle width, leaf spacer, and status badge width) so child rows do not push content right
