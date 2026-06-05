## Context

The chat prompt is a `contentEditable` div in `chat.js`. It already has a command picker system triggered by `/` (slash commands). The file finder dialog lives in `edit-buffer.js` as a modal overlay with its own input, search scoring, keyboard navigation, and file list fetching via `GET /sessions/:id/files`.

Currently `openFileFinder()` always opens the dialog for editing — `selectFile()` loads the file into the editor. There's no callback mechanism to use the file finder for other purposes.

The `send_message` WebSocket handler in `handlers.ts` receives plain text content and forwards it to the agent. There is no `@path` expansion.

## Goals / Non-Goals

**Goals:**
- Let users type `@` in the chat prompt to open the file finder and pick a file
- Insert `@path/to/file.ts` at cursor position in the contentEditable prompt after selection
- Resolve `@path` tokens server-side to inject file content into the agent prompt
- Reuse the existing file finder dialog and scoring — no new UI components

**Non-Goals:**
- Styled token chips or rich rendering of `@` mentions in the prompt
- Tab completion or inline dropdown picker
- `@folder/`, `@url`, or any reference type other than files
- Paths with spaces

## Decisions

### 1. File finder callback mode via `openFileFinder` options

Extend `openFileFinder(pattern, options)` to accept `{ mode: "mention", onSelect: (file) => void }`.

- When `mode === "mention"` and `onSelect` is provided, file selection calls `onSelect(file)` instead of the default `selectFile(file)`.
- The dialog closes after selection in both modes.
- This keeps the file finder generic and reusable for future use cases.

**Alternative considered**: Emit a `CustomEvent` on selection. Rejected because it requires global listeners and makes the contract implicit. A direct callback is simpler and explicit.

### 2. Detect `@` via `keydown` on the contentEditable

Listen for `@` keypress (the key that produces `@`) on the contentEditable's `keydown` event. On detection:

1. Prevent default (don't insert `@` into the text yet)
2. Call `openFileFinder("", { mode: "mention", onSelect })` 
3. The `onSelect` callback inserts `@file.path` at the current cursor position using `document.execCommand("insertText", false, text)`

**Alternative considered**: Detect `@` on `input` event and parse text. Rejected because it requires cursor-position parsing and we're opening a modal dialog anyway — the simpler keypress approach is sufficient.

### 3. Cursor-position insertion via `execCommand`

After file selection, focus the contentEditable and use `document.execCommand("insertText", false, "@" + file.path)`. This:
- Inserts at the current cursor position (which is preserved while the modal is open)
- Integrates with undo/redo
- Matches the existing paste handler pattern in the codebase

### 4. Backend `@path` resolution in WebSocket handler

In the `send_message` handler, before forwarding to the agent:

1. Parse `@tokens` from the message using regex `/(^|[\s])@([\S]+)/g`
2. For each token, attempt to read the file via `FileService.readFile(workspacePath, path)`
3. Prepend resolved file contents to the prompt in a structured format:
   ```
   <file path="src/app.ts">
   ...file content...
   </file>
   ```
4. If a file doesn't exist, leave the `@token` as-is (user may have typed `@` for other reasons)

### 5. Expose `openFileFinder` globally for cross-module access

`openFileFinder` lives in `edit-buffer.js` (an IIFE). To call it from `chat.js`, expose it on `window`:
- `window.openFileFinder = openFileFinder`

This follows the existing pattern — the codebase already uses `window.*` for cross-module function sharing between JS files loaded via `<script>` tags.

## Risks / Trade-offs

- **`@` in normal text**: Users typing `@` for non-mention purposes (e.g., email addresses, decorators) will get the file finder popping up. Mitigation: this is acceptable for P1 — the dialog can be dismissed with Escape. Future iterations could use smarter detection.
- **Cursor position after modal**: The browser may lose cursor position when the modal opens. Mitigation: save and restore the Selection/Range before opening the dialog.
- **Large file content**: `@`-referencing a large file could bloat the prompt. Mitigation: the agent provider already handles context limits; no truncation in P1.
