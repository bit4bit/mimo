# Design: Add PatchBuffer

## Architecture Overview

```
ExpertMode (browser)
    │
    │  POST /sessions/:sid/patch-buffers
    ▼
PatchBufferService (backend, in-memory)
    │  keyed by sessionId + filePath
    │  holds: originalContent, replacements[], patchedContent
    │
    ├── GET  /sessions/:sid/patch-buffers/:encodedPath  → patch record
    ├── POST /sessions/:sid/patch-buffers/:encodedPath/approve → write file, delete record
    └── DELETE /sessions/:sid/patch-buffers/:encodedPath       → discard record

PatchBuffer (browser buffer)
    │  fetches record on mount / after reload
    │  renders vertical-split diff
    │  Approve → POST approve → close tab
    │  Decline → DELETE record  → close tab
```

---

## Backend: PatchBufferService

### Data Model

```ts
interface Replacement {
  file: string;
  replace_start_line: number;
  replace_end_line: number;
  replacement: string;
}

interface PatchRecord {
  sessionId: string;
  filePath: string;
  originalContent: string;
  replacements: Replacement[];
  patchedContent: string;   // pre-computed at creation time
  createdAt: Date;
  status: "pending";        // only pending records are kept; resolved ones are deleted
}
```

Key: `sessionId:filePath` (URL-decoded path).

### Patch Application Algorithm

Replacements are applied in **reverse line-order** (highest `replace_start_line` first) so that earlier line numbers remain valid as later replacements are inserted.

Steps:
1. Sort replacements by `replace_start_line` descending.
2. Split `originalContent` into lines array.
3. For each replacement: splice out lines `[replace_start_line-1 .. replace_end_line-1]` (0-indexed), insert `replacement.split("\n")`.
4. Join and store as `patchedContent`.

### REST API

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/sessions/:sid/patch-buffers` | `{filePath, originalContent, replacements[]}` | `PatchRecord` |
| `GET` | `/sessions/:sid/patch-buffers/:encodedPath` | — | `PatchRecord` or 404 |
| `POST` | `/sessions/:sid/patch-buffers/:encodedPath/approve` | — | `{ok: true}` |
| `DELETE` | `/sessions/:sid/patch-buffers/:encodedPath` | — | `{ok: true}` |

`encodedPath` = `encodeURIComponent(filePath)`.

`approve` writes `patchedContent` to disk via the existing file-write service, then deletes the record.

---

## LLM Prompt Schema Change (ExpertMode)

### Old output schema
```json
{
  "file": "<FILE_PATH>",
  "replace_start_line": 10,
  "replace_end_line": 12,
  "replacement": "..."
}
```

### New output schema
```json
{
  "replacements": [
    {
      "file": "<FILE_PATH>",
      "replace_start_line": 10,
      "replace_end_line": 12,
      "replacement": "..."
    }
  ]
}
```

Error case (unchanged):
```json
{ "file": "<FILE_PATH>", "error": "OUT_OF_SCOPE_CHANGE_REQUIRED" }
```

`MIMO_EXPERT_UTILS.extractReplacement` is updated to parse the new schema and return `Replacement[]`.

---

## ExpertMode Handoff Flow

1. LLM response arrives → `handleExpertDiffReady` is called.
2. Parse `replacements[]` from response.
3. Fetch current file content from `/sessions/:sid/files/content?path=...` (original).
4. `POST /sessions/:sid/patch-buffers` with `{filePath, originalContent, replacements}`.
5. Backend returns `PatchRecord` (including `patchedContent`).
6. Frontend activates the `patch` buffer tab for that file (creates it if needed).
7. ExpertMode resets its own state to `idle` — it no longer owns the diff.

---

## Frontend: PatchBuffer

### Frame Integration

A new buffer type `patch:<filePath>` is added to the frame-buffer system alongside `edit`.

Tab label: `Patch: <filename>` (e.g. `Patch: calc.py`)

Multiple patch tabs can coexist (one per pending `filePath`).

### Rendering

```
┌─────────────────────────────────────────────────────────────────┐
│  Patch: calc.py                    [Approve]  [Decline]          │
├────────────────────────┬────────────────────────────────────────┤
│  ORIGINAL (current)    │  MODIFIED (proposed)                   │
│  ─────────────────     │  ─────────────────                     │
│  40  def abs(self, x): │  40  def abs(self, x: float) -> float: │ ← green highlight
│  41    return abs(x)   │  41    """Return abs value of x."""    │ ← green highlight
│                        │  42    return -x if x < 0 else x      │ ← green highlight
│  (red highlight on     │                                        │
│   removed lines)       │                                        │
└────────────────────────┴────────────────────────────────────────┘
```

- Left pane: `originalContent`, removed lines highlighted red with left border.
- Right pane: `patchedContent`, added lines highlighted green with left border.
- Both panes scroll in sync (same logic as current `renderDiffPreview`).
- Syntax highlighting via `hljs` using the file language.

### Browser Reload Recovery

On buffer mount:
1. Read `sessionId` and `filePath` from the tab's `data-*` attributes.
2. `GET /sessions/:sid/patch-buffers/:encodedPath`.
3. If 404 → buffer auto-closes (patch was already resolved).
4. If 200 → render diff from `record.originalContent` and `record.patchedContent`.

### Approve

1. `POST /sessions/:sid/patch-buffers/:encodedPath/approve`.
2. Close this patch tab.
3. Mark the corresponding Edit buffer file as outdated → it reloads automatically.

### Decline

1. `DELETE /sessions/:sid/patch-buffers/:encodedPath`.
2. Close this patch tab.
3. Focus returns to Edit buffer for the file (no file change).

---

## Constraints

- `PatchBufferService` is in-memory only. Sessions that are destroyed (clear/delete) must evict all records for that `sessionId`.
- No persistence to disk. If the server restarts, pending patches are lost (acceptable — they are short-lived).
- The approve endpoint must use the same file-write service as the rest of the platform to ensure watchers and checksums are updated correctly.
