## Why

Users currently view files in the EditBuffer in read-only mode. When they want to refactor or edit a file, they must switch to the Chat buffer, type an instruction, and hope the agent edits the right thing — there is no visual connection between the file being viewed and the edit instruction. This context-switching is friction-heavy and error-prone: the LLM lacks awareness of which file and lines the user is focused on, and the user cannot preview changes before they are applied to the original file.

Expert mode closes this gap by letting the user issue edit/refactor instructions directly from the EditBuffer, using the active chat thread's LLM, with a preview-and-confirm flow that protects the original file.

## What Changes

- Add an **Expert Mode toggle** to the EditBuffer (button in the context bar or keyboard shortcut)
- When enabled, render a **7-line focus guide** (highlight overlay) on the current file content centered around the cursor/scroll position, showing the LLM which lines will be the focus of the refactor
- Render an **instruction input box** at the bottom of the EditBuffer (styled like the chat editable bubble), bound to the currently selected chat thread
- On instruction submission: before sending the prompt, the system **copies the active file to a temporary file** (`<path>.mimo-expert.tmp`), then sends the instruction to the LLM via the chat thread with a system-level context message that constrains the LLM to **only edit the temporary file** within the focus range
- When the LLM finishes (usage_update), the EditBuffer **shows a diff view** comparing the original file vs the temporary file
- The user can **confirm** (apply changes to original, delete temp) or **reject** (delete temp, keep original unchanged)
- On confirm: overwrite the original file with the temp file content, delete the temp file, refresh the EditBuffer
- On reject: delete the temp file, restore the original view

## Capabilities

### New Capabilities

- `expert-mode-toggle`: Enable/disable expert mode in the EditBuffer via button or keybinding
- `expert-focus-guide`: 7-line visual indicator showing the refactor focus range in the file content view
- `expert-instruction-input`: Input box at the bottom of EditBuffer for edit/refactor instructions
- `expert-context-injection`: System message prepended to the user instruction providing file path, focus range, and edit-only constraint
- `expert-temp-file`: Copy-on-write mechanism that creates a temporary file before LLM edits
- `expert-diff-preview`: Side-by-side or unified diff view showing proposed changes before applying
- `expert-confirm-reject`: User confirmation flow to apply or discard the LLM's changes

### Modified Capabilities

- `edit-buffer`: Add expert mode toggle, focus guide overlay, instruction input, and diff preview to the EditBuffer UI
- `chat-thread-instruction`: Send instructions through the existing chat thread with expert-mode context metadata
- `file-watching`: Existing file watcher must ignore `.mimo-expert.tmp` files

## Impact

### Server-Side (mimo-platform)
- `packages/mimo-platform/src/buffers/EditBuffer.tsx`: Add expert mode toggle button, focus guide, input box placeholder, diff view placeholder
- `packages/mimo-platform/src/files/routes.ts`: Add `POST /api/sessions/:sessionId/files/copy` (copy file to temp), `DELETE /api/sessions/:sessionId/files/temp` (delete temp), `POST /api/sessions/:sessionId/files/apply` (apply temp to original)
- `packages/mimo-platform/src/files/service.ts`: Add `copyFile()`, `deleteTempFile()`, `applyTempFile()` pure functions
- `packages/mimo-platform/src/index.tsx`: Handle new `expert_instruction` WebSocket message type that wraps the instruction with context and forwards a `user_message` to the agent with the system prefix
- `packages/mimo-platform/public/js/edit-buffer.js`: Add expert mode state, focus guide rendering, instruction input, diff view rendering, confirm/reject actions

### Server-Side (mimo-agent)
- `packages/mimo-agent/src/index.ts`: No changes needed — the expert context arrives as a regular `user_message` with the system prefix already embedded; the agent cannot distinguish it from a normal instruction

### Client-Side
- `packages/mimo-platform/public/js/edit-buffer.js`: Major additions — expert mode toggle, focus guide, instruction input, diff view, confirm/reject, temp file lifecycle
- `packages/mimo-platform/public/js/session-keybindings.js`: Add `toggleExpertMode` keybinding (default: `Alt+Shift+E`), `confirmExpertChanges` (Ctrl+Enter), `rejectExpertChanges` (Alt+Shift+G)

### Tests
- `packages/mimo-platform/test/files-expert-mode.test.ts`: Test copy, apply, delete temp file flows
- `packages/mimo-platform/test/expert-mode.test.ts`: Integration test for the full expert mode flow

## Key Constraints

1. **No direct agent modification**: The LLM receives the edit instruction as a regular `user_message` with a prepended system context. The agent does not need to know about expert mode.
2. **Single-file scope**: Expert mode only works on the file currently open in the EditBuffer. The LLM is instructed to only modify the temporary copy of that file.
3. **Thread selection**: The user must have an active chat thread selected. The instruction is sent through that thread's ACP session.
4. **Focus guide is visual only**: The 7-line indicator is a UI overlay; it does not restrict the LLM but informs it of the user's area of interest.
5. **Temp file naming convention**: `<original-path>.mimo-expert.tmp` — consistent, predictable, easy to filter from file watchers and file finder results.
6. **Idempotent confirm/reject**: Confirming twice or rejecting after confirm are no-ops. Rejecting deletes the temp file if it exists.
7. **Concurrent safety**: Only one expert-mode edit session per file at a time. If the user tries to send another instruction while a diff preview is pending, prompt to confirm/reject the pending changes first.

## Risks / Trade-offs

- **LLM may edit outside the temp file**: The system prefix asks the LLM to edit only the temp file, but LLMs are not guaranteed to comply. Mitigation: the diff preview reveals exactly what changed; the user can reject.
- **LLM may edit non-adjacent lines**: The focus guide suggests the range but does not enforce it. Mitigation: same as above — user reviews the diff.
- **Temp file visibility**: The `.mimo-expert.tmp` file may appear in file watchers, file finder, and impact buffer. Mitigation: add `.mimo-expert.tmp` to default ignore patterns in `applyIgnorePatterns()` and the file watcher service.
- **Race conditions**: If the user edits the original file manually while the LLM is editing the temp file, the diff may be misleading. Mitigation: warn the user if the original file's checksum changes during expert mode.
- **Thread context pollution**: The expert-mode instruction carries a system prefix. This becomes part of the chat thread's history, potentially confusing future conversations. Mitigation: mark the message with metadata `expertMode: true` so it can be filtered or collapsed in the chat view; the prefix is minimal and task-focused.