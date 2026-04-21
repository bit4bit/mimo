# Design: Commit Preview Flat List

## Context

Current commit preview (`commit.js`) builds an expandable tree with:
- Directory nodes with tri-state checkboxes
- File nodes with word-status badges ("Added"/"Modified"/"Deleted")
- Inline unified diff for expanded modified files

ImpactBuffer (`chat.js`) changed-files section uses:
- Flat list of file rows
- Symbol badges: `+` (new), `~` (changed), `-` (deleted)
- Truncated paths via `shortPath()`
- Click opens file in EditBuffer or PatchBuffer

## Goals

- Unified visual pattern for changed-files across both surfaces
- Shared rendering logic to prevent drift
- Consistent click behavior (PatchBuffer for inspection)

## Decisions

### Decision: Flat list over tree
**Choice:** Replace tree with flat list in commit preview.

**Rationale:** ImpactBuffer already uses flat list successfully. Users don't need directory grouping for commit review. Flat list is simpler, faster, consistent.

### Decision: Keep inline diff in commit preview
**Choice:** Modified files in commit preview expand inline diff on click (same as original behavior). ImpactBuffer opens PatchBuffer on click.

**Rationale:** Commit preview is the review surface before committing — inline diff provides immediate context without leaving the modal. ImpactBuffer is for navigation, so PatchBuffer makes sense there.

### Decision: Shared render function
**Choice:** Extract `renderChangedFileRow()` and `shortPath()` to `public/js/utils.js`.

**Rationale:** Both commit preview and ImpactBuffer render identical file rows. Shared function prevents style drift.

### Decision: Symbol badges
**Choice:** `+`/`~`/`-` symbols for all changed-files surfaces.

**Rationale:** Matches ImpactBuffer. Monospace, compact, color-coded. Word labels ("Added"/"Modified"/"Deleted") are verbose and inconsistent with ImpactBuffer.

## Architecture

### 1. `public/js/utils.js`

New shared utility module:

```javascript
// Constants
const FILE_STATUS_META = {
  added:     { badge: "+", cssClass: "file-status-new",     color: "#51cf66" },
  modified:  { badge: "~", cssClass: "file-status-changed",  color: "#74c0fc" },
  deleted:   { badge: "-", cssClass: "file-status-deleted",  color: "#ff6b6b" },
};

// Truncate path to last 2 segments
function shortPath(path) {
  const parts = path.split("/");
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path;
}

// Render a file row DOM element
function renderChangedFileRow(file, options = {}) {
  // Returns: { element, checkbox?, label? }
}

// Open file in PatchBuffer (shared click handler)
function openFileInPatchBuffer(path, sessionId, opts = {}) {
  // Delegates to window.MIMO_PATCH_BUFFER.addPatch()
}
```

### 2. Commit Preview (`commit.js`)

Changes:
- Remove `buildTree()`, `renderTreeNodes()`, `renderFileDiff()`, `getDescendantFiles()`
- Remove `expandedFiles`, `expandedDirs` state
- Flatten visible files into sorted list
- Use `renderChangedFileRow()` for each file
- Keep checkboxes for selection (checkbox is part of row)
- Click on row opens PatchBuffer (not expand diff)
- Keep directory tri-state logic? No — flat list, no directories

Selection behavior for flat list:
- Each row has its own checkbox
- No directory-level selection
- Select All / Deselect All? Future enhancement

### 3. ImpactBuffer (`chat.js`)

Changes:
- Replace inline `changedFilesHtml` string building with `renderChangedFileRow()` calls
- Import `shortPath()` and `FILE_STATUS_META` from utils
- Keep existing click behavior (EditBuffer for new, PatchBuffer for changed)

### 4. CSS (`SessionDetailPage.tsx`)

Remove tree-specific rules:
- `.tree-node`, `.tree-node-row`, `.tree-toggle`, `.tree-children`
- `.tree-icon`, `.tree-icon--folder`, `.tree-icon--file`
- `.file-diff`, `.file-diff-header`, `.diff-hunk`, `.diff-line`

Add flat-list rules (match ImpactBuffer):
- `.commit-file-row` — flex, gap, padding, hover
- `.commit-file-status` — monospace, colored symbol
- `.commit-file-path` — truncated monospace path

Reuse existing `.impact-file-row` classes? Option: rename to generic `.file-row` and share. But to minimize change, keep separate class names with identical rules.

## Data Flow

```
GET /commits/:sessionId/preview
  → preview.files (FileChange[])
  → filter by status
  → sort alphabetically
  → renderChangedFileRow(file) ∀ files
  → commit preview flat list

metrics.byFile (FileImpactDetail[])
  → filter status !== "unchanged"
  → renderChangedFileRow(file) ∀ files
  → ImpactBuffer changed files list
```

## Server Changes

### New module: `src/commits/changed-files.ts`

Extracts file change detection from impact calculator into reusable module:

- `detectChangedFiles(upstreamPath, workspacePath)` — scans both directories, compares checksums, returns {added, modified, deleted} files
- `applySelectedFiles(upstreamPath, workspacePath, selectedPaths)` — copies/deletes selected files from workspace to upstream

### Updated `commits/service.ts`

**Preview (`getPreview`):**
1. Uses `detectChangedFiles()` for accurate file list
2. Also generates patch via `generatePatch()` for inline diff hunks
3. Merges results: file list from detection + hunks from patch parsing

**Commit (`commitAndPushSelective`):**
1. Uses `detectChangedFiles()` for accurate file list
2. Validates selected paths against detected files
3. Uses `applySelectedFiles()` to copy selected files to upstream
4. Generates patch after applying for history storage
5. Commits and pushes as before

### Removed fossil sync

Both preview and commit now use current workspace state (matching impact buffer).

## Risks

- **Loss of directory grouping**: Mitigation — users can search/select in flat list; alphabetical sorting keeps related files near each other.
- **Checkbox selection without directory select-all**: Mitigation — status filters still work; select-all can be added later.
