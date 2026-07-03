## Why

Users today can only browse the project via the flat **FileFinder** dialog (`Mod+Shift+F`) or the Impact/Commit changed-file lists. There is no persistent, navigable view of the project's directory structure. A **FileTree buffer** in the right frame (next to Notes) gives users a collapsible tree they can keep open, spot changed files at a glance, and click to open into the Edit/Patch buffer — reusing the existing file list, changed-file detection, and open-file entry points rather than introducing new machinery.

## What Changes

- Add a new **FileTree buffer** registered in the right frame, positioned immediately after the Notes buffer in tab order.
- Render a **collapsible directory tree** of the session workspace, built **client-side** from the existing `GET /api/sessions/:sessionId/files` flat list (no new tree endpoint).
- **All folders collapsed by default**, except the ancestor directories of changed files are auto-expanded so changed-file highlights are visible on first paint.
- **Highlight changed files** using the existing `detectChangedFiles` + `ChangedFilesCache` domain logic. A new endpoint `GET /api/sessions/:sessionId/changed-files` exposes the changed-files result (path + status) to the client.
- Reuse the existing `FILE_STATUS_META` styling (`+` green / `~` blue) and `renderChangedFileRow`-style badges; only **present files** are listed (deleted files are not shown in the tree).
- Clicking a file node opens it via the existing entry points: `window.EditBuffer.openFile(path)` for added files, `openFileInPatchBuffer(path, sessionId)` for modified files, and switches to the left frame (`window.switchFrameBuffer`).
- **Lazy refresh**: the tree reloads from `/files` and `/changed-files` when the buffer becomes active (`isActive=true`); no websocket subscription, no background polling.

## Capabilities

### New Capabilities
- `file-tree-buffer`: A right-frame buffer that renders the session workspace as a collapsible directory tree, highlights changed files, and opens files into the Edit/Patch buffer on click.

### Modified Capabilities
- `frame-buffers`: Adds the FileTree buffer to the right-frame default set, registered after Notes; extends the buffer registry with the new buffer.

## Impact

- **Frontend (new)**:
  - `packages/mimo-platform/public/js/file-tree.js` — tree builder (flat → nested), collapse/expand handling, changed-file highlighting, click-to-open wiring, lazy refresh on `isActive`.
  - `packages/mimo-platform/src/web/features/sessions/components/buffers/FileTreeBuffer.tsx` — server-rendered shell + hydration hook.
  - Register `file-tree` in `buffers/index.ts` (right frame, after `notes`).
  - Embed `file-tree.js` via `assets.ts` and `SessionDetailPage.tsx`.
- **Backend (new)**:
  - `GET /api/sessions/:sessionId/changed-files` in `api/rest/files.ts` — wraps `detectChangedFiles` + `ChangedFilesCache`, returns `{ files: [{path, status, size}], summary }`.
- **Reused (no change)**:
  - `domain/files/changed-files.ts`, `domain/commits/changed-files-cache.ts`, `domain/files/service.ts:listFiles`.
  - `public/js/utils.js` (`FILE_STATUS_META`, `renderChangedFileRow`, `openFileInPatchBuffer`), `edit-buffer.js` (`window.EditBuffer.openFile`, `openFileFinder`).
- **Tests**: new REST handler test for `/changed-files`; new unit tests for the client-side tree builder (flat→nested, expand-to-changed algorithm).