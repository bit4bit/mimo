## Why

Users need to reference workspace files when composing chat messages, similar to how Claude Code CLI uses `@` to attach file context. Currently there's no way to mention files inline in the chat prompt — users must describe file paths manually, which is error-prone and slow.

## What Changes

- Detect `@` keypress in the chat contentEditable prompt and open the existing file finder dialog in a new "mention" mode.
- On file selection, insert `@path/to/file.ts` at the cursor position in the prompt and close the dialog.
- Extend `openFileFinder()` to accept a `{ mode: "mention", onSelect: fn }` option so the file finder can serve both editing and mention use cases.
- Backend resolves `@path` references in chat messages to file content before forwarding to the agent provider.

## Capabilities

### New Capabilities
- `chat-at-mention`: File mention via `@` in the chat prompt — trigger file finder, insert path, resolve content server-side.

### Modified Capabilities
- `chat-file-link-open-file-finder`: Extend file finder to support a "mention" callback mode alongside the existing edit-buffer mode.

## Impact

- **Frontend**: `chat.js` (keypress detection, cursor insertion), `edit-buffer.js` (file finder mode/callback support)
- **Backend**: WebSocket `send_message` handler — parse and expand `@path` references before forwarding to agent
- **No new dependencies or API endpoints** — reuses existing `GET /sessions/:id/files` and file finder UI
