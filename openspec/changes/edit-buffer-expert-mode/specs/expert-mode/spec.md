# Specification: EditBuffer Expert Mode

## Requirements

### R1: Expert Mode Toggle
The EditBuffer SHALL provide a toggle mechanism (button in context bar + Alt+Shift+E keybinding) that enables or disables expert mode. When enabled, the EditBuffer shows a focus guide, instruction input, and thread selector overlay. The enabled state persists in localStorage per session.

### R2: Focus Guide
When expert mode is enabled, the EditBuffer SHALL display a 7-line focus guide overlay centered on the middle visible line of the file content viewport. The focus guide highlights the lines the user is currently viewing and recalculates on scroll.

### R3: Instruction Input
When expert mode is enabled and idle, the EditBuffer SHALL display an instruction input box at the bottom of the buffer content area. The input is styled similarly to the chat editable bubble (contenteditable div with "⌃↵ Send" button). The input accepts edit/refactor instructions.

### R4: Thread Binding
The instruction input SHALL use the currently active chat thread (from `window.MIMO_CHAT_THREADS.getActiveThreadId()`). The thread name SHALL be displayed in the context bar. If no thread exists, the input SHALL be disabled with a message: "Create a chat thread first."

### R5: Copy-on-Write Before Edit
When the user submits an instruction, the system SHALL:
1. Call `POST /api/sessions/:sessionId/files/copy` with the active file path
2. The server creates a copy at `<path>.mimo-expert.tmp` in the same directory
3. The server returns `{ tempPath, originalChecksum }`
4. The client stores `tempPath` and `originalChecksum` in `ExpertMode` state

### R6: Context Injection
The system SHALL construct a context message prepended to the user's instruction containing:
- File path (original and temp)
- Focus line range (start-end from focus guide)
- Instruction to edit the temporary file only
The combined message is sent as a `user_message` through the active chat thread with `metadata.expertMode = true`.

### R7: Processing State
After submitting an instruction, the EditBuffer SHALL transition to a `"processing"` state where:
- The instruction input becomes read-only with "Processing..." indicator
- A cancel button appears
- The focus guide remains visible
- The user cannot submit another instruction until the current one completes

### R8: Diff Preview
When the LLM response completes (usage_update for a thread with a pending expert instruction), the system SHALL:
1. Fetch the temp file content from the server
2. Compute a stacked diff between the original content (in memory) and the temp file content
3. Display the diff in two vertically stacked panes replacing the file content area:
   - **Top pane**: "ORIGINAL (current)" header, shows the current file with removed lines highlighted in red
   - **Bottom pane**: "MODIFIED (proposed)" header, shows the proposed changes with added lines highlighted in green
4. Both panes display full file content with line numbers and syntax highlighting
5. Each pane scrolls independently
6. Show "✓ Apply" and "✕ Reject" buttons in the context bar
7. Transition to `"diff_preview"` state

### R9: Apply Changes
When the user clicks "✓ Apply" (or presses Ctrl+Enter):
1. Call `POST /api/sessions/:sessionId/files/apply` with `{ originalPath, tempPath }`
2. The server reads the temp file, overwrites the original, and deletes the temp file
3. The EditBuffer refreshes the file content
4. Transition to `"idle"` state with brief "Changes applied" confirmation

### R10: Reject Changes
When the user clicks "✕ Reject" (or presses Alt+Shift+G):
1. Call `DELETE /api/sessions/:sessionId/files/temp` with `{ tempPath }`
2. The server deletes the temp file
3. The original file remains unchanged
4. Transition to `"idle"` state with brief "Changes rejected" confirmation

### R11: Cancellation During Processing
When the user clicks cancel during the processing state:
1. Send a `cancel_request` through the existing chat cancel mechanism
2. If the temp file was partially modified, attempt to fetch its content and show diff preview
3. If the temp file was not modified (empty or identical to original), delete it and return to idle

### R12: Temp File Filtering
Files matching the pattern `*.mimo-expert.tmp` SHALL be filtered from:
- File finder search results
- Impact buffer change listings
- File watcher `file_outdated` and `file_deleted` events

### R13: Race Condition Warning
If the original file is modified externally while expert mode is in `"processing"` or `"diff_preview"` state, the EditBuffer SHALL display a warning banner: "The original file has been modified externally. Applying changes may overwrite recent edits."

### R14: Concurrent Instruction Prevention
The EditBuffer SHALL prevent submitting a new instruction while in `"processing"` or `"diff_preview"` state. If the user attempts to submit, display: "Confirm or reject the current changes first."

### R15: Chat Thread Display
Expert-mode messages SHALL appear in the chat thread with a collapsed `[Expert Edit: <filename>]` badge. The badge uses the `metadata.expertMode` flag stored in the chat message JSONL.

### R16: Expert Mode State Persistence
The `enabled` boolean of expert mode SHALL persist in localStorage at key `mimo:edit-buffer-expert:<sessionId>`. On page load, if enabled, the EditBuffer initializes in `"idle"` state (not `"processing"` or `"diff_preview"` — those are transient).

### R17: Cleanup on Page Unload
If the EditBuffer is in `"processing"` or `"diff_preview"` state when the page unloads, any temp files SHALL remain on disk (they are cleaned up by the file watcher ignore patterns and will not interfere with normal operation). The state resets to `"idle"` on next load.

## API Specification

### POST /api/sessions/:sessionId/files/copy
**Request:**
```json
{
  "path": "src/utils/helpers.ts"
}
```

**Response:** 200 OK
```json
{
  "tempPath": "src/utils/helpers.ts.mimo-expert.tmp",
  "originalChecksum": "abc123def456"
}
```

**Error:** 404 if file not found, 400 if path invalid or contains `..`

### POST /api/sessions/:sessionId/files/apply
**Request:**
```json
{
  "originalPath": "src/utils/helpers.ts",
  "tempPath": "src/utils/helpers.ts.mimo-expert.tmp"
}
```

**Response:** 200 OK
```json
{
  "success": true
}
```

**Error:** 404 if temp file not found, 400 if tempPath does not end with `.mimo-expert.tmp`

### DELETE /api/sessions/:sessionId/files/temp
**Request:**
```json
{
  "tempPath": "src/utils/helpers.ts.mimo-expert.tmp"
}
```

**Response:** 200 OK
```json
{
  "success": true
}
```

**Error:** 404 if temp file not found, 400 if tempPath does not end with `.mimo-expert.tmp`

## WebSocket Message Specification

### Client → Server: expert_instruction
```json
{
  "type": "expert_instruction",
  "chatThreadId": "thread-uuid",
  "originalPath": "src/utils/helpers.ts",
  "tempPath": "src/utils/helpers.ts.mimo-expert.tmp",
  "focusStart": 34,
  "focusEnd": 40,
  "instruction": "Refactor the helper function to be async"
}
```

### Server → Client: expert_diff_ready
```json
{
  "type": "expert_diff_ready",
  "chatThreadId": "thread-uuid",
  "originalPath": "src/utils/helpers.ts",
  "tempPath": "src/utils/helpers.ts.mimo-expert.tmp"
}
```

## UI Specification

### Expert Mode Toggle Button
- Position: right side of File Context Bar, after language indicator
- Label: "Expert" (off state), "Expert ✓" (on state)
- Style: matches existing context bar buttons (like "Reload" and "✕ Close")
- Color: default gray (off), blue/green accent (on)

### Focus Guide
- 7 lines highlighted with a subtle background color (#1a2a1a for dark theme)
- Left border: 2px solid accent color (e.g., #4caf50)
- Centered on the middle visible line of the viewport
- Recalculates on scroll

### Instruction Input Box
- Position: bottom of EditBuffer, below file content view
- Style: contenteditable div with monospace font, dark background (#1a1a1a)
- Border: 1px solid #444 rounded
- Send button: "⌃↵ Send" (same as chat bubble)
- Placeholder: "Enter edit instruction..."
- Disabled when no active chat thread

### Diff Preview
- Position: replaces file content area with two vertically stacked panes
- **Top pane**: "ORIGINAL (current)" header with the current file content
  - Full file content with line numbers and syntax highlighting
  - Removed lines (lines present in original but not in modified): red background (#3a1a1a), red left border (2px solid #f44336)
  - Unchanged lines: normal styling
  - Independent vertical scrolling
- **Bottom pane**: "MODIFIED (proposed)" header with the proposed changes
  - Full file content with line numbers and syntax highlighting
  - Added lines (lines present in modified but not in original): green background (#1a3a1a), green left border (2px solid #4caf50)
  - Unchanged lines: normal styling
  - Independent vertical scrolling
- Pane divider: 1px solid #444 between the two panes
- Both panes take equal height (50/50 split of the content area)
- Line numbers displayed for both panes

### Apply/Reject Buttons
- Position: right side of File Context Bar (replace "✕ Close" when in diff_preview)
- Apply: "✓ Apply" (green accent)
- Reject: "✕ Reject" (red accent)

### Keyboard Shortcuts
- `Alt+Shift+E`: Toggle expert mode on/off
- `Ctrl+Enter`: Apply changes (when in diff_preview state)
- `Alt+Shift+G`: Reject changes (when in diff_preview state)
- Shortcuts shown in bottom shortcuts bar when in expert mode