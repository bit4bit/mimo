## Architecture

### 1. `window.EditBuffer.openFile(path)`

New public method on `window.EditBuffer` that:
- Calls `fetchAndAddFile(sessionId, path, callback)`
- Switches the left frame to the edit buffer tab
- Focuses the edit buffer content area

Mirrors `selectFile()` but takes a path string directly (no dialog involved).

### 2. "Changed Files" section in `renderImpactMetrics()`

After the existing metrics sections, render a new section showing all files from
`metrics.byFile` where `status !== "unchanged"`.

Each row: `[status badge] [filename]` — click behavior depends on status:

- `new` → green `+` → `window.EditBuffer.openFile(path)` (workspace only, no upstream)
- `changed` → blue `~` → `window.MIMO_PATCH_BUFFER.addPatch(...)` showing upstream vs workspace diff
- `deleted` → red `-` → no-op (file is gone from workspace)

File path display: truncated from the right (`.../ prefix`) if > 2 path segments.

### 3. New server endpoint: upstream file content

`GET /sessions/:id/files/upstream-content?path=` — reads from the session's `upstreamPath`
instead of the workspace. Required so PatchBuffer can load the original version of a changed file.

PatchBuffer currently fetches both `originalPath` and `patchPath` from the same
`/files/content` endpoint, so there is no way to serve upstream content without a new endpoint.

### 4. PatchBuffer: `originalEndpoint` + `readOnly` support

`addPatch` gains two optional parameters:

- `originalEndpoint` — path segment replacing `/files/content` when fetching `originalPath`;
  default falls back to `/files/content` (no change for existing callers)
- `readOnly` — boolean; when `true`, approve/decline buttons are hidden and disabled so the
  diff is shown for inspection only

When triggered from ImpactBuffer, both flags are set. Existing edit-buffer callers pass neither,
preserving current approve/decline behavior.

### 5. ImpactBuffer click for `changed` files

```javascript
window.MIMO_PATCH_BUFFER.addPatch({
  sessionId,
  originalPath: path,       // relative path — fetched from upstream endpoint
  patchPath: path,           // same relative path — fetched from workspace endpoint
  originalEndpoint: "files/upstream-content",
  sourceBufferId: "impact",
});
```

### 6. CSS in `ImpactBuffer.tsx`

Classes (already implemented):
- `.impact-file-row` — flex row, cursor pointer, hover highlight
- `.impact-file-status` — colored monospace badge (12px)
- `.impact-file-path` — truncated monospace path (12px)
- `.impact-file-row.deleted` — cursor default, muted color (no pointer)

## Data Flow

```
metrics.byFile (FileImpactDetail[])
  → filter status !== "unchanged"
  → renderImpactMetrics() builds HTML rows
  → click:
      new     → EditBuffer.openFile(path)
      changed → MIMO_PATCH_BUFFER.addPatch({ originalEndpoint: "files/upstream-content", ... })
      deleted → no-op
```

## Server Changes Required

- `files/routes.ts`: add `GET /upstream-content?path=` that reads from `upstreamPath`
- `sessions/routes.tsx` or context: expose `upstreamPath` for the files router
