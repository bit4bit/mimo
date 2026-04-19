# Specification: EditBuffer Expert Mode

## Requirements

### R1: Expert Mode Toggle
The EditBuffer SHALL provide a toggle mechanism (button in context bar + Alt+Shift+E keybinding) that enables or disables expert mode. When enabled, the EditBuffer shows a focus guide, instruction input, and thread selector. The enabled state persists in localStorage per session.

### R2: Focus Guide
When expert mode is enabled, the EditBuffer SHALL display a focus guide overlay centered on the middle visible line of the file content viewport. The focus guide highlights the lines the user is currently viewing and recalculates on scroll.

The focus range size is adjustable:
- Default: 7 lines
- Minimum: 3 lines
- No maximum (bounded by file length)
- `Alt+Control+ArrowUp` increases the size by 2 lines
- `Alt+Control+ArrowDown` decreases the size by 2 lines (clamped at minimum)
- The adjusted size resets to default when expert mode is toggled off

### R3: Instruction Input
When expert mode is enabled and idle, the EditBuffer SHALL display an instruction input box at the bottom of the buffer content area. The input is styled similarly to the chat editable bubble (contenteditable div with "⌃↵ Send" button). Shown when user presses `Enter`; hidden after sending.

### R4: Thread Binding
The instruction input SHALL use the currently active chat thread (from `window.MIMO_CHAT_THREADS.getActiveThreadId()`). The thread name SHALL be displayed in the context bar. If no thread exists, the input SHALL show "Create a chat thread first" and be disabled.

### R5: Read File Content
When the user submits an instruction, the system SHALL:
1. Call `GET /sessions/:sessionId/files/content?path=<filePath>` to get the current file content
2. Unescape the HTML-escaped `content` field → store as `expertMode.originalContent`
3. No files are written at this stage

### R6: Constrained Editing Prompt
The system SHALL send a constrained editing prompt to the LLM through the active chat thread containing:
- File path (original)
- Focus line range (start-end from focus guide)
- Full **unescaped** file content
- The user's edit instruction

Prompt template per design D2. The client sends this as a `user_message` via WebSocket with `metadata.expertMode = true`.

### R7: Processing State
After submitting an instruction, the EditBuffer SHALL transition to `"processing"` state:
- Instruction input becomes read-only with "Processing..." indicator
- A cancel button appears
- Focus guide remains visible
- No new instruction can be submitted until the current one completes or is cancelled

### R8: Write Patch File
When the LLM response completes (`expert_diff_ready` received), the system SHALL:
1. Extract the JSON replacement fragment from the LLM response using `MIMO_EXPERT_UTILS.extractReplacement()`
2. Apply the replacement to `expertMode.originalContent` using `MIMO_EXPERT_UTILS.applyReplacement()` → `patchedContent`
3. Call `POST /sessions/:sessionId/patches` with `{ originalPath, content: patchedContent }`
4. Server writes `patchedContent` to `.mimo-patches/<originalPath>` in the workspace, returns `{ patchPath }`
5. Call `window.MIMO_PATCH_BUFFER.addPatch({ sessionId, originalPath, patchPath })`
6. Clear `expertMode.originalContent` from state
7. Transition to `"idle"` with brief "Patch sent to PatchBuffer" toast

### R9: Error on Non-JSON Response
If `extractReplacement()` returns null (LLM produced non-JSON or `OUT_OF_SCOPE_CHANGE_REQUIRED`):
1. Show error in EditBuffer: "LLM did not return a valid edit" (or the specific error if `OUT_OF_SCOPE_CHANGE_REQUIRED`)
2. Clear `expertMode.originalContent`
3. Transition to `"idle"`

### R10: Cancellation During Processing
When the user clicks cancel during `"processing"` state:
1. Send `cancel_request` through the existing chat cancel mechanism
2. Clear `expertMode.originalContent` from state
3. Transition to `"idle"` — no patch file was written, nothing to clean up

### R11: Race Condition Warning
If the original file is modified externally while expert mode is in `"processing"` state, the EditBuffer SHALL display a warning banner: "The original file has been modified externally. The patch may be stale."

### R12: Concurrent Instruction Prevention
The EditBuffer SHALL prevent submitting a new instruction while in `"processing"` state. If the user attempts to submit, display: "Wait for the current instruction to complete."

### R13: Chat Thread Display
Expert-mode messages SHALL be sent to the chat thread with `metadata.expertMode = true`. The chat UI MAY render a collapsed `[Expert Edit: <filename>]` badge using this flag.

### R14: Expert Mode State Persistence
The `enabled` boolean SHALL persist in localStorage at key `mimo:edit-buffer-expert:<sessionId>`. On page load, the EditBuffer transitions to `"idle"` if `enabled` is true. `originalContent` is never persisted.

### R15: Patch Recovery on Page Load
On EditBuffer initialization, the system SHALL call `GET /sessions/:sessionId/patches` to list any pending patch files from a previous session, and call `window.MIMO_PATCH_BUFFER.addPatch()` for each, so PatchBuffer restores the pending review tabs.

### R16: Patch Folder Filtering
Files under `.mimo-patches/` SHALL be filtered from:
- File finder search results
- Impact buffer change listings
- File watcher `file_outdated` and `file_deleted` events

## API Specification

### GET /sessions/:sessionId/files/content
**Query params:** `path=<filePath>`

**Response:** 200 OK
```json
{
  "path": "src/utils/helpers.ts",
  "name": "helpers.ts",
  "language": "typescript",
  "lineCount": 42,
  "content": "<html-escaped file content>"
}
```

Note: `content` is HTML-escaped. Client MUST unescape before use.

**Error:** 404 if not found, 403 if access denied

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
{
  "patchPath": ".mimo-patches/src/utils/helpers.ts"
}
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

## WebSocket Message Specification

### Client → Server: expert_instruction
```json
{
  "type": "expert_instruction",
  "sessionId": "session-uuid",
  "chatThreadId": "thread-uuid",
  "originalPath": "src/utils/helpers.ts",
  "instruction": "Refactor the helper function to be async",
  "focusRange": "34-40"
}
```

### Server → Client: expert_diff_ready
```json
{
  "type": "expert_diff_ready",
  "chatThreadId": "thread-uuid",
  "originalPath": "src/utils/helpers.ts"
}
```

## UI Specification

### Expert Mode Toggle Button
- Position: right side of File Context Bar
- Label: "Expert Mode" (off), "Expert Mode ✓" (on)
- Color: gray (off), blue/green accent (on)

### Focus Guide
- Default 7 lines, adjustable via Alt+Control+Arrow
- Subtle background: #1a2a1a (dark theme)
- Left border: 2px solid #4caf50
- Centered on middle visible line, recalculates on scroll

### Instruction Input Box
- Position: bottom of EditBuffer, below file content
- Style: contenteditable div, monospace, dark background
- Send button: "⌃↵ Send"
- Placeholder: "Enter edit instruction..."
- Shown on `Enter` key press; hidden after send

### Keyboard Shortcuts
- `Alt+Shift+E`: Toggle expert mode on/off
- `Enter`: Show instruction input (when expert mode idle, not in editable field)
- `Alt+Control+ArrowUp`: Increase focus guide size by 2 lines
- `Alt+Control+ArrowDown`: Decrease focus guide size by 2 lines (minimum 3)
- `Ctrl+Enter`: Send instruction (when input is focused)
