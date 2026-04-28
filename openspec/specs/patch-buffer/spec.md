# Specification: PatchBuffer

## Overview

PatchBuffer is a dedicated buffer for reviewing and acting on proposed file patches. It is populated programmatically — any component (expert mode, future tools) can add a patch by calling `window.MIMO_PATCH_BUFFER.addPatch()`. The user reviews each patch in a vertical split diff view and either Approves (writes patched content to the original file) or Declines (discards the patch).

## Requirements

### PB1: Buffer Registration
PatchBuffer SHALL be registered in the buffer registry and rendered as a standard session buffer (server-rendered HTML shell, same layout as EditBuffer with tabs bar and context bar).

### PB2: Patch Tabs
PatchBuffer SHALL display one tab per pending patch. Each tab shows the original file name. Tabs are closeable — closing is equivalent to Decline. Multiple patches for different files can be open simultaneously.

### PB3: Context Bar
The context bar SHALL display:
- The original file path of the active patch
- **"✓ Approve"** button (green accent)
- **"✕ Decline"** button (red accent)

When no patch is active, the context bar shows "No pending patches."

### PB4: Vertical Split Diff View
The diff area SHALL render two panes side by side with equal width and independent vertical scrolling:
- **Left pane** — "ORIGINAL" header, full original file content with line numbers
  - Lines removed (present in original, absent in patched): red background `#3a1a1a`, red left border `2px solid #f44336`
  - Unchanged lines: normal styling
- **Right pane** — "PATCHED" header, full patched file content with line numbers
  - Lines added (present in patched, absent in original): green background `#1a3a1a`, green left border `2px solid #4caf50`
  - Unchanged lines: normal styling
- Pane divider: `1px solid #444`
- Both panes scroll independently

The diff is computed using `window.MIMO_DIFF.computeDiff(originalContent, patchedContent)`.

### PB5: Loading Patch Content
When a patch tab is activated, PatchBuffer SHALL:
1. Call `GET /sessions/:sessionId/files/content?path=<originalPath>` → unescape → `originalContent`
2. Call `GET /sessions/:sessionId/files/content?path=<patchPath>` → unescape → `patchedContent`
3. Compute and render the diff

### PB6: Approve
When the user clicks "✓ Approve" (or presses Ctrl+Enter while PatchBuffer is active):
1. Call `POST /sessions/:sessionId/patches/approve` with `{ originalPath, patchPath }`
2. Server atomically: reads patch file, writes content to original path, deletes patch file
3. Close the tab
4. If the original file is open in EditBuffer, the file watcher triggers a reload
5. Toast: "Approved — <filename>"

### PB7: Decline
When the user clicks "✕ Decline" (or presses Alt+Shift+G while PatchBuffer is active):
1. Call `DELETE /sessions/:sessionId/patches` with `{ patchPath }`
2. Server deletes the patch file
3. Close the tab; original file unchanged
4. Toast: "Declined — <filename>"

### PB8: Programmatic API
PatchBuffer SHALL expose a global API:

```javascript
window.MIMO_PATCH_BUFFER.addPatch({
  sessionId: string,
  originalPath: string,  // e.g. "src/utils/helpers.ts"
  patchPath: string,     // e.g. ".mimo-patches/src/utils/helpers.ts"
})
```

Calling `addPatch()` with an `originalPath` that already has an open tab SHALL replace that tab's content (update in place) rather than opening a duplicate.

### PB9: Race Condition Warning
If a `file_outdated` event fires for the `originalPath` of an open patch tab, PatchBuffer SHALL display a warning banner on that tab: "The original file has been modified externally. This diff may be stale."

### PB10: Empty State
When no patch tabs are open, PatchBuffer SHALL display a placeholder: "No pending patches."

### PB11: Keyboard Shortcuts
- `Ctrl+Enter`: Approve active patch (when PatchBuffer is focused)
- `Alt+Shift+G`: Decline active patch (when PatchBuffer is focused)

## API Specification

### POST /sessions/:sessionId/patches
**Request:**
```json
{
  "originalPath": "src/utils/helpers.ts",
  "content": "// full patched file content\n..."
}
```

**Response:** 200 OK
```json
{ "patchPath": ".mimo-patches/src/utils/helpers.ts" }
```

**Error:** 400 if `originalPath` contains `..` or is missing

### GET /sessions/:sessionId/patches
**Response:** 200 OK
```json
{
  "patches": [
    { "originalPath": "src/utils/helpers.ts", "patchPath": ".mimo-patches/src/utils/helpers.ts" }
  ]
}
```

### POST /sessions/:sessionId/patches/approve
**Request:**
```json
{
  "originalPath": "src/utils/helpers.ts",
  "patchPath": ".mimo-patches/src/utils/helpers.ts"
}
```

**Response:** 200 OK
```json
{ "success": true }
```

**Error:** 404 if patch file not found, 400 if `patchPath` does not start with `.mimo-patches/`

### DELETE /sessions/:sessionId/patches
**Request body:**
```json
{ "patchPath": ".mimo-patches/src/utils/helpers.ts" }
```

**Response:** 200 OK
```json
{ "success": true }
```

**Error:** 400 if `patchPath` does not start with `.mimo-patches/`

## UI Specification

### Layout
```
┌───────────────────────────────────────────────────────────┐
│                     Patch Tabs Bar                        │
│  ┌─────────────────┐  ┌─────────────────┐                │
│  │ helpers.ts  ✕   │  │ service.ts  ✕   │                │
│  └─────────────────┘  └─────────────────┘                │
├───────────────────────────────────────────────────────────┤
│  Context Bar                                              │
│  src/utils/helpers.ts         [✓ Approve]  [✕ Decline]  │
├───────────────────┬───────────────────────────────────────┤
│  ORIGINAL         │  PATCHED                              │
│  1 │ line one     │  1 │ line one                        │
│  2─│ old line     │  2+│ new line                        │
│  3 │ line three   │  3 │ line three                      │
└───────────────────┴───────────────────────────────────────┘
```

### Diff Line Styling
- **Removed line** (original pane): `background: #3a1a1a; border-left: 2px solid #f44336;`
- **Added line** (patched pane): `background: #1a3a1a; border-left: 2px solid #4caf50;`
- **Unchanged line**: default background, no border marker

### Tab Styling
- Active tab: highlighted background, file name in bold
- Tab close button (✕): appears on hover

### Approve / Decline Buttons
- Approve: green accent (`#4caf50`), label "✓ Approve"
- Decline: red accent (`#f44336`), label "✕ Decline"
- Both disabled when no active patch tab
