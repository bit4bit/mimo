## Context

The session page renders two frames via the buffer registry (`buffers/registry.ts`, `Frame.tsx`). The right frame currently exposes Notes, Impact, Summary, MCP, Plan. File browsing today is limited to:

- **FileFinder dialog** (`FileFinderDialog.tsx` + `edit-buffer.js:1255 loadFileList`) — a flat, keyboard-driven filter over `GET /api/sessions/:sessionId/files`. No persistent view, no directory structure.
- **Impact / Commit lists** — flat changed-file rows built by `renderChangedFileRow` (`public/js/utils.js`) using `FILE_STATUS_META`.

There is no persistent, navigable tree view of the workspace. Changed-file detection already exists (`domain/files/changed-files.ts:detectChangedFiles`, cached by `ChangedFilesCache`) but is only reachable via the Impact calculator and commit preview — there is no REST endpoint that returns the changed-files list directly.

Opening a file is already centralized: `window.EditBuffer.openFile(path)` for added/new files, `openFileInPatchBuffer(path, sessionId)` for modified files (which also calls `window.switchFrameBuffer("left", "patches")`).

## Goals / Non-Goals

**Goals:**
- Add a right-frame **FileTree buffer** (tab ordered after Notes) showing the workspace as a collapsible directory tree.
- Build the tree **client-side** from the existing flat `GET /api/sessions/:sessionId/files` response.
- Highlight changed files (added/modified) by reusing `detectChangedFiles` + `ChangedFilesCache` via a **new REST endpoint** `GET /api/sessions/:sessionId/changed-files`.
- Reuse `FILE_STATUS_META` styling and `renderChangedFileRow`-style badges; only **present files** appear (deleted files are not shown).
- Clicking a file node opens it through the existing `window.EditBuffer.openFile` / `openFileInPatchBuffer` entry points and switches focus to the left frame.
- All folders **collapsed by default**, except ancestor directories of changed files auto-expand so changed-file highlights are visible on first paint.
- **Lazy refresh**: reload `/files` and `/changed-files` only when the buffer becomes active (`isActive=true`). No websocket subscription, no polling.

**Non-Goals:**
- Server-built tree endpoint (deferred; client-side build is sufficient for current workspace sizes).
- Live/push updates via the existing `"files"` websocket connection type.
- Showing deleted files in the tree.
- Inline rename/create/delete actions from the tree.
- Search/filtering within the tree (the FileFinder dialog already covers this).

## Decisions

### D1: Client-side tree construction from the flat file list
Reuse `GET /api/sessions/:sessionId/files` (returns `FileInfo[] = { path, name, size }`) and group by `/` in JS.

**Rationale:** The FileFinder already fetches and sorts this same flat list. A nested tree builder is ~30 lines of pure JS. No new backend service method, no schema change, no extra test surface on the domain layer.

**Alternatives considered:**
- *Server-built tree* (`listFileTree` in `domain/files/service.ts` returning nested `{ name, path, children? }[]`): cleaner reuse if other buffers ever need a tree, but YAGNI today — only the FileTree buffer consumes it. Adds a service method + endpoint + tests for no current extra consumer.

### D2: New endpoint `GET /api/sessions/:sessionId/changed-files`
Wraps `detectChangedFiles` + `ChangedFilesCache` (same wiring as `ImpactCalculator.calculateImpact` at `calculator.ts:191-228`). Returns:
```json
{
  "files": [{ "path": "src/x.ts", "status": "added"|"modified"|"deleted", "size": 123 }],
  "summary": { "added": 1, "modified": 2, "deleted": 0 }
}
```
Cache lookup keyed by `(sessionId, upstreamPath, workspacePath)`; on miss, run `detectChangedFiles` with a `createManifestStore` (mirroring the impact path) and `set` the cache. The tree filters out `deleted` entries client-side.

**Rationale:** `detectChangedFiles` is the authoritative source already shared by Impact and Commit. Exposing it directly avoids a third changed-file signal. The cache is shared, so a tree refresh after a commit-preview re-scan is free.

**Alternatives considered:**
- *Reuse Impact's `metrics.byFile`*: filtered to impact-relevant paths and shaped for impact display, not a raw change list. Wrong shape, wrong scope.
- *git `status --porcelain`*: the project is mid-migration from fossil to git (`replace-fossil-with-git` change); `detectChangedFiles` is VCS-agnostic and already abstracts this. Don't bypass it.

### D3: Collapse-by-default + auto-expand ancestors of changed files
Tree builder produces a nested structure with `expanded: boolean` per directory. Initial render:
1. Every directory starts `expanded: false`.
2. Walk each changed-file path; for each ancestor directory along the path, set `expanded: true`.
3. Render: collapsed subtrees skip their children; expanded subtrees render recursively.

So a changed file at `src/domain/files/changed-files.ts` forces `src/`, `src/domain/`, `src/domain/files/` open, while unrelated top-level dirs (e.g. `docs/`, `scripts/`) stay collapsed.

**Rationale:** Honors "collapsed by default" literally (unchanged subtrees stay collapsed) while making the highlight feature visible on first paint without user interaction. Cost: one extra pass over changed-file paths — trivial.

**Alternatives considered:**
- *Fully collapsed + aggregate "N changed inside" dir badges*: honest but hides the payoff; requires a separate aggregation pass and a new badge style.
- *Fully collapsed + "jump to next changed" keystroke*: useful later, but more UX to build; defer.

### D4: Reuse existing open-file entry points
Tree-node click handler calls the same branches as `utils.js:renderChangedFileRow:74-91`:
- `status === "added"` → `window.EditBuffer.openFile(path)`
- `status === "modified"` → `openFileInPatchBuffer(path, sessionId)` (which itself calls `window.switchFrameBuffer("left", "patches")`)
- unchanged → `window.EditBuffer.openFile(path)`

No new "open" code path. The left-frame switch is preserved for modified files so the diff is immediately visible.

### D5: Lazy refresh on buffer activation
The buffer component already receives `isActive: boolean` via `BufferProps`. The client module watches transitions `false → true` and re-fetches both `/files` and `/changed-files`, then rebuilds the tree. No subscription to the `"files"` WS channel, no `setInterval` polling.

**Rationale:** Simplest correct option. Workspaces don't change while the buffer is hidden behind another tab in a way the user expects to see live; on activation, a fresh fetch reflects reality. If staleness becomes a complaint later, subscribing to the existing `"files"` WS connection is an additive follow-up.

### D6: Styling reuse
Use the existing `FILE_STATUS_META` map (`utils.js:6`) and the same CSS classes (`file-status-new`, `file-status-changed`) so colors/badges match Impact and Commit. A tree node is a new minimal DOM shape (`<div class="tree-node" data-path=...>`) with the status badge appended when the file is changed. Tree indentation via nested `<ul>`/`<li>` (or nested `<div>` with left padding) — pick whichever matches existing `notes-buffer`/`impact-buffer` styling conventions during implementation.

## Risks / Trade-offs

- **[Large workspaces slow client tree build]** → Mitigation: tree build is O(n) in file count and runs once per activation; the existing FileFinder already loads the same flat list without complaint. If it becomes an issue, add a size cap or switch to D1's server-built-tree alternative.
- **[Changed-files scan is expensive on miss]** → Mitigation: `ChangedFilesCache` is shared with Impact/Commit; a recent commit-preview or impact refresh populates it, making the tree's `/changed-files` call a cache hit. First-load miss is the same cost Impact already pays.
- **[Auto-expand makes deep trees jump]** → Mitigation: only ancestors of changed files expand; siblings stay collapsed. If a change touches files across many dirs, the tree opens more — which is the intended signal.
- **[Two fetches on activation]** → Mitigation: `Promise.all` the `/files` and `/changed-files` requests; render only when both resolve.
- **[`detectChangedFiles` requires `upstreamPath` + `workspacePath`]** → Mitigation: the session record already carries `upstreamPath` (`sessions/repository.ts:204 getUpstreamPath`); the endpoint resolves both from the session, same as the Impact WS handler does (`handlers.ts:479`).

## Migration Plan

Additive only — no existing behavior changes:
1. Ship backend endpoint + tests.
2. Ship frontend module + buffer component + registration.
3. No frame-state migration: the new buffer simply appears in the right-frame tab bar. Users who had `notes`/`impact` active are unaffected; the new tab is available on next page load.

Rollback: remove the `registerBuffer({ id: "file-tree", ... })` call and the new endpoint route; no data migration, no persisted state to clean up (the buffer carries no server-side state of its own).