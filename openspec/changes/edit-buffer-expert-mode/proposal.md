## Why

Users currently view files in the EditBuffer in read-only mode. When they want to refactor or edit a file, they must switch to the Chat buffer, type an instruction, and hope the agent edits the right thing — there is no visual connection between the file being viewed and the edit instruction. This context-switching is friction-heavy and error-prone.

Expert mode closes this gap by letting the user issue edit/refactor instructions directly from the EditBuffer. When the LLM responds, the proposed change is written to a dedicated patch folder and surfaced in a new **PatchBuffer** — a purpose-built review interface where the user can inspect a vertical side-by-side diff and explicitly Approve or Decline each proposed change.

## What Changes

- Add an **Expert Mode toggle** to the EditBuffer (button in context bar or Alt+Shift+E keybinding)
- When enabled, render a **focus guide** (highlight overlay) centered on the current scroll position, showing the LLM which lines are the area of interest
- Render an **instruction input box** at the bottom of the EditBuffer (styled like the chat editable bubble), bound to the currently active chat thread
- On instruction submission: read the current file content, send a constrained editing prompt to the LLM via the chat thread
- When the LLM responds with a JSON replacement fragment: apply it in memory to produce the patched content, **write the patched content to `.mimo-patches/<original-path>`** in the workspace, then **hand the patch to PatchBuffer** via `window.MIMO_PATCH_BUFFER.addPatch()`
- ExpertMode returns to idle — the review happens entirely in **PatchBuffer**

### PatchBuffer (New Component)

A dedicated buffer for reviewing and acting on proposed file patches:
- **Tabs**: one tab per pending patch (multiple files can have concurrent pending patches)
- **Context bar**: shows the original file path; **Approve** and **Decline** buttons
- **Vertical split diff**: left pane = original file, right pane = patched file; changed lines highlighted inline
- **Approve**: server copies `.mimo-patches/<path>` over the original file path, deletes the patch file
- **Decline**: server deletes the patch file, original file unchanged
- Programmatic API: `window.MIMO_PATCH_BUFFER.addPatch({ sessionId, originalPath, patchPath })`

## Capabilities

### New Capabilities

- `expert-mode-toggle`: Enable/disable expert mode in the EditBuffer via button or keybinding
- `expert-focus-guide`: Visual indicator showing the refactor focus range in the file content view
- `expert-instruction-input`: Input box at the bottom of EditBuffer for edit/refactor instructions
- `expert-context-injection`: Constrained editing prompt providing file path, focus range, full file content, and edit request
- `patch-buffer`: New buffer component for reviewing proposed file patches
- `patch-vertical-split`: Side-by-side diff view (left=original, right=patched) with inline highlighting
- `patch-approve-decline`: Approve copies patch → original; Decline deletes patch

### Modified Capabilities

- `edit-buffer`: Add expert mode toggle, focus guide overlay, instruction input
- `chat-thread-instruction`: Send instructions through the existing chat thread with expert-mode context metadata
- `file-ignore-patterns`: `.mimo-patches/` directory filtered from file finder, file watcher events, and impact buffer

## Impact

### Server-Side (mimo-platform)
- `packages/mimo-platform/src/buffers/EditBuffer.tsx`: Add expert mode toggle, focus guide, instruction input
- `packages/mimo-platform/src/buffers/PatchBuffer.tsx`: New buffer component — tabs, context bar, vertical split diff
- `packages/mimo-platform/public/js/patch-buffer.js`: New client JS — tab state, diff rendering, approve/decline
- `packages/mimo-platform/src/files/expert-service.ts`: Add `writePatchFile()`, `approvePatch()`, `declinePatch()`
- `packages/mimo-platform/src/sessions/routes.tsx`: Add `POST /sessions/:id/patches`, `POST /sessions/:id/patches/approve`, `DELETE /sessions/:id/patches`
- `packages/mimo-platform/src/files/service.ts`: Add `.mimo-patches/` to default ignore patterns
- `packages/mimo-platform/src/index.tsx`: Handle `expert_instruction` WebSocket message, send `expert_diff_ready` on LLM completion
- `packages/mimo-platform/public/js/edit-buffer.js`: Expert mode state, focus guide, instruction input, patch dispatch on LLM response

### Client-Side
- `packages/mimo-platform/public/js/edit-buffer.js`: Expert mode toggle, focus guide, instruction input, LLM response handling
- `packages/mimo-platform/public/js/patch-buffer.js`: Patch tabs, vertical split, Approve/Decline
- `packages/mimo-platform/public/js/session-keybindings.js`: Add `toggleExpertMode` (Alt+Shift+E), `expertInput` (Enter), focus resize shortcuts
- `packages/mimo-platform/src/components/Layout.tsx`: Load `patch-buffer.js`

### Tests
- `packages/mimo-platform/test/expert-mode-service.test.ts`: Existing + patch file operations
- `packages/mimo-platform/test/expert-mode-api.test.ts`: Existing + patch endpoints
- `packages/mimo-platform/test/patch-buffer.test.ts`: PatchBuffer state and diff rendering

## Key Constraints

1. **No direct agent modification**: The LLM receives the edit instruction as a regular `user_message`. The agent does not know about expert mode.
2. **Single-file scope per instruction**: Expert mode operates on the file currently open in EditBuffer. One patch per file at a time.
3. **PatchBuffer is the review layer**: EditBuffer transitions back to idle immediately after dispatching to PatchBuffer. Review, Approve, and Decline happen in PatchBuffer only.
4. **Patch folder convention**: `.mimo-patches/<original-relative-path>` — mirrors workspace structure, one file per pending patch.
5. **`.mimo-patches/` filtered everywhere**: Must not appear in file finder, file watcher events, or impact buffer.
6. **Approve is server-side atomic**: The server reads the patch file, writes it to the original path, and deletes the patch in a single operation to avoid partial state.

## Risks / Trade-offs

- **LLM may produce out-of-scope edits**: The prompt asks for a minimal fragment but compliance is not guaranteed. The PatchBuffer diff view reveals exactly what changed; the user can decline.
- **LLM may return non-JSON**: `extractReplacement()` uses fallback parsing. If it fails, no patch is written and an error is shown in the EditBuffer.
- **Race conditions**: If the original file is modified externally while a patch is pending in PatchBuffer, approving will overwrite the external change. Mitigation: warn the user when a `file_outdated` event fires for a file with a pending patch tab.
- **Patch file persistence across reloads**: Unlike the previous in-memory approach, patch files survive page reloads. On EditBuffer initialization, scan for existing `.mimo-patches/` entries and re-add them to PatchBuffer.
- **Thread context pollution**: Each expert instruction adds a large technical message to the chat thread. Mitigation: `metadata.expertMode = true` allows future collapse/filtering.
