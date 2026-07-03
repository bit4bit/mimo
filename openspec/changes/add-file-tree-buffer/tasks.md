## 1. Changed-files REST endpoint

- [x] 1.1 Write failing test for `GET /api/sessions/:sessionId/changed-files` returning `{ files, summary }` from a stubbed `detectChangedFiles` (cache-hit path returns cached result without invoking detection)
- [x] 1.2 Write failing test for the cache-miss path: `detectChangedFiles` is invoked with a manifest store, result is stored in `ChangedFilesCache`, then returned
- [x] 1.3 Write failing test for session-not-found returning 404 `{ error: "Session not found" }`
- [x] 1.4 Implement the `/changed-files` route in `web/features/sessions/pages/sessions.tsx` next to the existing `/sessions/:id/files` route: resolve `upstreamPath` + `workspacePath` from the session (mirror `handlers.ts:479` impact wiring), consult `ChangedFilesCache`, fall back to `detectChangedFiles` with `createManifestStore`, cache the result
- [x] 1.5 Extend `SessionsRoutesContext` (or its deps) with `changedFilesCache`, `detectChangedFiles` (or `impactCalculator`), `os`, and session-path resolvers; wire them in the sessions route mount point
- [x] 1.6 Run `bun test` in `packages/mimo-platform`; confirm new tests pass and existing file-route tests still pass

## 2. Client-side tree builder module

- [x] 2.1 Write failing unit test for `buildTree(flatFiles)` returning a nested `{ name, path, children?, isDir }[]` structure grouped by `/` segments
- [x] 2.2 Write failing unit test for `computeExpandedPaths(tree, changedFilePaths)` returning the set of ancestor directory paths of every changed file (empty input → empty set)
- [x] 2.3 Write failing unit test for `mergeChangedStatus(tree, changedFiles)` marking each leaf with its `status` (`added`/`modified`) and omitting `deleted` entries (deleted files produce no node)
- [x] 2.4 Implement `buildTree`, `computeExpandedPaths`, `mergeChangedStatus` as pure functions in a new `public/js/file-tree.js` module (no DOM mutation in the pure helpers)
- [x] 2.5 Run tests; confirm pure-function helpers pass

## 3. Tree rendering and interaction

- [x] 3.1 Write failing test for `renderTree(tree, { expandedPaths, changedMap, sessionId, onFileClick })` producing DOM nodes where collapsed directories omit children and expanded directories render them
- [x] 3.2 Write failing test for a leaf click invoking `onFileClick(path, status)` with the file's path and status
- [x] 3.3 Implement `renderTree` in `file-tree.js`: directory nodes toggle `expanded` on click and re-render children; leaf nodes use `FILE_STATUS_META` badges (`file-status-new` / `file-status-changed`) for changed files
- [x] 3.4 Implement the click handler: `added` → `window.EditBuffer.openFile(path)` + `switchFrameBuffer("left","edit")`; `modified` → `openFileInPatchBuffer(path, sessionId)`; unchanged → `window.EditBuffer.openFile(path)` + `switchFrameBuffer("left","edit")`
- [x] 3.5 Add `data-help-id` attributes to tree nodes and the Files tab button consistent with other buffers

## 4. Lazy refresh on buffer activation

- [x] 4.1 Write failing test for the activation handler: when `isActive` transitions `false → true`, the module issues parallel `fetch` to `/files` and `/changed-files`, then rebuilds and re-renders the tree
- [x] 4.2 Write failing test that no fetches occur while `isActive` remains `false` or while it stays `true` (no polling)
- [x] 4.3 Implement the activation watcher in `file-tree.js` (subscribe to `isActive` changes via the buffer panel's `active`/`hidden` class toggles or an exposed callback), `Promise.all` the two fetches, build tree, auto-expand changed-file ancestors, render
- [x] 4.4 Expose a manual "refresh" affordance (small button or `data-help-id` keystroke) reusing the same load path

## 5. Buffer component and registration

- [x] 5.1 Create `src/web/features/sessions/components/buffers/FileTreeBuffer.tsx` — a server-rendered shell (container with `data-session-id`, `data-buffer-id="file-tree"`) that mounts the client module; mirror `NotesBuffer.tsx` structure
- [x] 5.2 Register `file-tree` in `buffers/index.ts` with `{ id: "file-tree", name: "Files", frame: "right", component: FileTreeBuffer }` positioned immediately after the `notes` registration
- [x] 5.3 Update `assets.ts` to embed `/js/file-tree.js` and `SessionDetailPage.tsx` to include the `<script>` tag, matching how `notes.js` is wired
- [x] 5.4 Export `FileTreeBuffer` from `buffers/index.ts`

## 6. Styling and help IDs

- [x] 6.1 Add CSS for tree nodes (indentation, expand/collapse caret, hover, active leaf) reusing existing `notes-buffer`/`impact-buffer` dark-theme variables; ensure `file-status-new` and `file-status-changed` classes apply to tree badges
- [x] 6.2 Verify the Files tab appears in the right-frame tab bar after Notes and matches `Frame.tsx` tab styling
- [x] 6.3 Add help-tooltip entries for the FileTree buffer (tab button + tree nodes + refresh affordance) consistent with other buffer help IDs

## 7. End-to-end verification

- [ ] 7.1 Manual: open a session, switch to the Files tab, confirm all directories start collapsed except ancestors of changed files
- [ ] 7.2 Manual: click an added file → Edit buffer opens it in the left frame; click a modified file → Patches buffer opens the diff in the left frame
- [ ] 7.3 Manual: switch away from Files tab and back → tree refreshes (re-fetches both endpoints); confirm no polling while idle
- [x] 7.4 Run `bun run test.full` in `packages/mimo-platform`; confirm the full suite passes
- [x] 7.5 Run `bun run lint` and any typecheck command in `packages/mimo-platform`; resolve any issues