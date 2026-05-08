## Design

### Schema shape

`open_file` keeps a single tool surface with one optional addition:

```json
{
  "name": "open_file",
  "description": "Open a file in the platform editor (EditBuffer) for the current session. Optionally scrolls to a specific line.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Relative path to the file within the session workspace"
      },
      "line": {
        "type": "integer",
        "minimum": 1,
        "description": "Optional 1-based line to center in the editor view after opening"
      }
    },
    "required": ["path"]
  }
}
```

Decisions deliberately deferred:

- **No `endLine`** — A range would imply a highlight UX. Not building that today.
- **No `column`** — The EditBuffer is read-only and has no cursor concept.
- **No `path:line` shorthand parsing** — Keep the contract strict so agents emit a structured field. Cheap to add later if needed.

### Validation stance: soft

The server already calls `fileService.readFile(workspacePath, filePath)` for path/access validation — that's enough work. For `line` we do **not** count lines or compare against `lineCount`:

- Accept `line` only if it is a positive integer (`Number.isInteger(line) && line >= 1`).
- Anything else (negative, zero, NaN, non-number, string) → drop the field silently and treat the call as line-less. Do **not** error the whole call.
- If `line` exceeds the file's actual line count, the browser's `querySelector` returns null and we no-op. This keeps the server lean and the agent forgiving.

Rationale: the cost of being strict (rejecting the whole call because the agent passed `line: 0`) is that an agent's tool call fails for a cosmetic argument. The user still wants the file open. Soft validation favors the user-visible outcome.

### Wire format

WebSocket payload (`open_file_in_editbuffer`) becomes:

```json
{
  "type": "open_file_in_editbuffer",
  "sessionId": "...",
  "path": "src/mcp/server.ts",
  "line": 138 // optional; only present when valid
}
```

Both broadcast targets — `chatSessions` and `fileWatchSessions` — get the same payload. No separate event for line-jumps.

### Browser behavior

In `edit-buffer.js`'s `open_file_in_editbuffer` handler, after the `fetchAndAddFile` callback runs:

1. `renderEditBuffer()` (existing)
2. Click the edit-buffer tab (existing)
3. Focus content element (existing)
4. **New**: if `data.line` is a positive integer, locate `#edit-buffer-lines-body tr[data-line-number="N"]` and call `scrollIntoView({ block: "center" })`. If the row doesn't exist, do nothing.

The scroll runs on the same callback path as the existing focus, so the DOM is already populated when we query. No `requestAnimationFrame` needed unless testing reveals a race.

### Already-open file case

`fetchAndAddFile` re-fetches and re-adds the entry to `EditBufferState`, which triggers `renderContent()` and resets `scrollPosition` to 0 on first add but preserves it on re-add. Two cases:

- **File not yet open** → renders fresh, then scroll-to-line lands cleanly.
- **File already open** → user's existing `scrollPosition` is honored by `renderContent`; we then override with `scrollIntoView` to land on `line`. This is the correct behavior: an explicit MCP `line` overrides any prior scroll state.

If the call has no `line`, we don't override — the user's prior scroll position is preserved (existing behavior unchanged).

### Why not flash/highlight

- Adds CSS state, timeout management, and "what if two opens land in the same second" edge cases.
- Centering is unambiguous and self-explanatory.
- Easy to add later as a separate refinement if the user asks.

### Test boundaries

Server-side (integration, behavior-only):

- Valid `path + line` → broadcast includes `line`
- Valid `path`, no `line` → broadcast omits `line` (current behavior preserved)
- `line: 0` / `line: -3` / `line: "abc"` / `line: 1.5` → broadcast omits `line`, call still succeeds
- Existing scenarios (path traversal, missing file, missing token) are unaffected

Browser-side: covered by manual verification per existing pattern in tasks 5.4 of the original `platform-mcp-server` change. No DOM test harness exists for `edit-buffer.js`.
