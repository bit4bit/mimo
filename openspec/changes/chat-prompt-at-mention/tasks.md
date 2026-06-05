## 1. File Finder Callback Mode

- [x] 1.1 Extend `openFileFinder()` in `edit-buffer.js` to accept `options` parameter with `{ mode, onSelect }` — store active callback in module state
- [x] 1.2 Modify `selectFile()` / `confirmSelection()` in `edit-buffer.js` to call `onSelect(file)` when in mention mode instead of loading the file in editor
- [x] 1.3 Expose `openFileFinder` on `window` for cross-module access from `chat.js`
- [x] 1.4 Write tests for file finder mention mode callback behavior

## 2. Chat Prompt @ Detection

- [x] 2.1 Add `keydown` listener in `insertEditableBubble()` and `insertEditableBubbleWithContent()` in `chat.js` to detect `@` keypress
- [x] 2.2 On `@` keypress: prevent default, save cursor position, call `window.openFileFinder("", { mode: "mention", onSelect })`
- [x] 2.3 Implement `onSelect` callback: restore cursor, insert `@file.path` via `document.execCommand("insertText")`, close dialog
- [x] 2.4 Write tests for @ detection and text insertion

## 3. Backend @ Resolution

- [x] 3.1 Create `resolveAtMentions(message, workspacePath, fileService)` utility that parses `@path` tokens and reads file contents
- [x] 3.2 Integrate `resolveAtMentions` in the `send_message` WebSocket handler to expand file references before forwarding to agent
- [x] 3.3 Write tests for @ token parsing, file resolution, and non-existent file passthrough
