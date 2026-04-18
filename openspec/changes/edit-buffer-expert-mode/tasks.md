## Tasks

### Proposal
- [x] Create `openspec/changes/edit-buffer-expert-mode/proposal.md`

### Design
- [x] Create `openspec/changes/edit-buffer-expert-mode/design.md`

### Specs
- [x] Create `openspec/changes/edit-buffer-expert-mode/specs/expert-mode/spec.md`

### Tasks
- [x] Create `openspec/changes/edit-buffer-expert-mode/tasks.md` (this file)

### Implementation

#### 1. Server-Side: File Copy/Apply/Delete API
- [ ] Create `packages/mimo-platform/src/files/expert-service.ts`
  - `copyFileToTemp(sessionId: string, filePath: string): Promise<{ tempPath: string, originalChecksum: string }>`
  - `applyTempFile(sessionId: string, originalPath: string, tempPath: string): Promise<boolean>`
  - `deleteTempFile(sessionId: string, tempPath: string): Promise<boolean>`
  - Pure functions with injected `FileService` and workspace path resolver
- [ ] Create `packages/mimo-platform/src/files/expert-routes.ts`
  - `POST /api/sessions/:sessionId/files/copy` — copy file to temp
  - `POST /api/sessions/:sessionId/files/apply` — apply temp to original
  - `DELETE /api/sessions/:sessionId/files/temp` — delete temp file
  - Validate `tempPath` ends with `.mimo-expert.tmp` (security: prevent arbitrary file deletion)
- [ ] Register expert routes in `packages/mimo-platform/src/index.tsx`

#### 2. Server-Side: Ignore Temp Files
- [ ] Update `packages/mimo-platform/src/files/service.ts`
  - Add `.mimo-expert.tmp` pattern to default ignore patterns in `applyIgnorePatterns()`
- [ ] Update file watcher (if applicable) to exclude `*.mimo-expert.tmp` from `file_outdated` notifications

#### 3. Server-Side: WebSocket Expert Instruction Handler
- [ ] Update `packages/mimo-platform/src/index.tsx`
  - Handle `expert_instruction` message type from client
  - Construct context prefix per D2 (file paths, focus range, instruction)
  - Forward as `user_message` to the thread's ACP agent via `resolveAgentId()`
  - Save message to chat JSONL with `metadata: { expertMode: true, originalPath, tempPath }`
  - Maintain `expertPending: Map<string, { chatThreadId, originalPath, tempPath }>` keyed by `sessionId:threadId`
  - On `usage_update` for a thread with pending expert instruction, send `expert_diff_ready` to client
  - Handle cancellation: when `cancel_request` arrives for a thread with pending expert, clear the pending state

#### 4. Client-Side: EditBuffer Expert Mode State
- [ ] Update `packages/mimo-platform/public/js/edit-buffer.js`
  - Add `ExpertMode` state object to `EditBufferState` closure
  - Add `toggleExpertMode()` function — toggle enabled, persist to localStorage
  - Add `computeFocusGuide(firstVisibleLine, lastVisibleLine)` function
  - Add state transitions: `off → idle → processing → diff_preview → idle`
  - Add `sendExpertInstruction(instruction)` — call copy API, construct WebSocket message
  - Add `handleExpertDiffReady(event)` — compute diff, render preview
  - Add `applyExpertChanges()` — call apply API, refresh content
  - Add `rejectExpertChanges()` — call delete temp API, return to idle
  - Add `renderExpertFocusGuide()` — 7-line overlay rendering
  - Add `renderExpertInput()` — instruction input box at bottom
  - Add `renderDiffPreview(diffLines)` — unified diff view
  - Add `renderExpertActions()` — Apply/Reject buttons in context bar
  - Add `updateFocusGuideOnScroll()` — recalculate on scroll events
  - Add localStorage persistence for `enabled` state only (key: `mimo:edit-buffer-expert:<sessionId>`)
  - Clean up temp files on page unload if in `processing` or `diff_preview` state

#### 5. Client-Side: EditBuffer.tsx HTML Shell Updates
- [ ] Update `packages/mimo-platform/src/buffers/EditBuffer.tsx`
  - Add expert mode toggle button in context bar (id="expert-mode-toggle")
  - Add thread name display (id="expert-thread-name")
  - Add focus guide overlay container (id="expert-focus-guide")
  - Add instruction input container (id="expert-instruction-input")
  - Add diff preview container (id="expert-diff-preview")
  - Add Apply/Reject actions container (id="expert-actions")
  - All hidden by default; shown via client-side state management

#### 6. Client-Side: Keybindings
- [ ] Update `packages/mimo-platform/public/js/session-keybindings.js`
  - Add `toggleExpertMode: "Alt+Shift+E"` to DEFAULT_KEYBINDINGS
  - Add `confirmExpertChanges: "Ctrl+Enter"` to DEFAULT_KEYBINDINGS
  - Add `rejectExpertChanges: "Alt+Shift+G"` to DEFAULT_KEYBINDINGS (when in diff_preview state)
  - Add handler functions that call `window.EditBuffer.toggleExpertMode()`, etc.
- [ ] Update `packages/mimo-platform/src/config/service.ts`
  - Add `toggleExpertMode`, `confirmExpertChanges`, `rejectExpertChanges` keybinding definitions
- [ ] Update `packages/mimo-platform/src/config/validator.ts`
  - Add new keybindings to valid list

#### 7. Client-Side: Diff Computation
- [ ] Create `packages/mimo-platform/public/js/diff.js`
  - `computeDiff(original: string, modified: string): DiffResult`
  - Returns `DiffResult` with two `DiffPane` objects: `{ original: DiffPane, modified: DiffPane }`
  - Each `DiffPane` contains a `lines: DiffLine[]` array
  - Each `DiffLine` has `{ type: "added" | "removed" | "unchanged", content: string, lineNumber: number }`
  - Original pane: removed lines marked red, unchanged lines normal, full file content
  - Modified pane: added lines marked green, unchanged lines normal, full file content
  - Line-based diff (Myers algorithm or longest-common-subsequence)
  - Pure function, no DOM dependency
  - Export on `window.MIMO_DIFF`

#### 8. Integration: Expert Mode in Chat Thread
- [ ] Update `packages/mimo-platform/public/js/chat.js`
  - Render expert-mode messages in chat with collapsed `[Expert Edit: <filename>]` badge
  - Use `metadata.expertMode` to identify expert-mode messages
  - On `expert_diff_ready` WebSocket message, dispatch to `EditBuffer.handleExpertDiffReady()`
- [ ] Update `packages/mimo-platform/public/js/chat-threads.js`
  - Export `getActiveThreadId()` (if not already exported via `window.MIMO_CHAT_THREADS`)

#### 9. Integration: Keyboard Shortcuts Bar
- [ ] Update `packages/mimo-platform/src/components/SessionDetailPage.tsx`
  - Add `Alt+Shift+E` Expert Mode to shortcuts bar
  - Add `Ctrl+Enter` Apply / `Alt+Shift+G` Reject shortcuts (shown when in expert diff preview)

#### 10. Testing

##### 10.1 Unit Tests
- [ ] Create `packages/mimo-platform/test/expert-mode-service.test.ts`
  - Test `copyFileToTemp()` creates temp file with correct naming
  - Test `copyFileToTemp()` computes original checksum
  - Test `applyTempFile()` overwrites original with temp content
  - Test `applyTempFile()` deletes temp after applying
  - Test `deleteTempFile()` removes temp file
  - Test `deleteTempFile()` does not touch original
  - Test temp path validation (must end with `.mimo-expert.tmp`)
  - Test path traversal prevention (reject `../` in paths)
  - Test `applyIgnorePatterns()` filters out `*.mimo-expert.tmp`

##### 10.2 Unit Tests: Diff Computation
- [ ] Create `packages/mimo-platform/test/diff.test.ts`
  - Test `computeDiff()` with identical content (no diff — both panes identical, no red/green lines)
  - Test `computeDiff()` with added lines — modified pane has green lines, original pane unchanged
  - Test `computeDiff()` with removed lines — original pane has red lines, modified pane unchanged
  - Test `computeDiff()` with changed lines (add + remove) — original pane shows removed lines red, modified pane shows added lines green
  - Test `computeDiff()` with empty original — original pane empty, modified pane all green
  - Test `computeDiff()` with empty modified — original pane all red, modified pane empty
  - Test `computeDiff()` preserves correct line numbers in both panes
  - Test `computeDiff()` returns `DiffResult` with `original` and `modified` `DiffPane` objects
  - Test `DiffResult.original.lines` always represents the full original file content
  - Test `DiffResult.modified.lines` always represents the full modified file content

##### 10.3 Integration Tests
- [ ] Create `packages/mimo-platform/test/expert-mode-api.test.ts`
  - Test `POST /api/sessions/:sessionId/files/copy` endpoint
  - Test `POST /api/sessions/:sessionId/files/apply` endpoint
  - Test `DELETE /api/sessions/:sessionId/files/temp` endpoint
  - Test security: reject paths with `../`
  - Test security: reject temp paths not ending in `.mimo-expert.tmp`

## Verification Steps

### Expert Mode Toggle
1. Start the platform
2. Open a session
3. Open a file in the EditBuffer
4. Press `Alt+Shift+E` — expert mode should activate
5. Verify focus guide overlay appears (7 highlighted lines)
6. Verify instruction input box appears at bottom
7. Verify thread name shown in context bar
8. Press `Alt+Shift+E` again — expert mode should deactivate
9. Verify focus guide, input box, and thread name disappear

### Sending an Expert Instruction
1. Enable expert mode
2. Type "Add error handling to this function" in instruction input
3. Press Ctrl+Enter
4. Verify temp file created (`<filename>.mimo-expert.tmp`)
5. Verify message appears in chat thread with `[Expert Edit]` badge
6. Verify instruction sent to LLM via thread
7. Verify EditBuffer shows "Processing..." state

### Diff Preview
1. After LLM completes, verify diff preview appears as two stacked panes in EditBuffer content area
2. Verify top pane shows "ORIGINAL (current)" header with the current file
3. Verify bottom pane shows "MODIFIED (proposed)" header with the proposed changes
4. Verify removed lines in the original pane have red background and red left border
5. Verify added lines in the modified pane have green background and green left border
6. Verify line numbers shown in both panes
7. Verify both panes display full file content (not just changed sections)
8. Verify each pane scrolls independently
9. Verify Apply/Reject buttons visible in context bar

### Apply Changes
1. Click "✓ Apply" button (or Ctrl+Enter)
2. Verify original file is updated with temp file content
3. Verify temp file is deleted
4. Verify EditBuffer refreshes to show updated file
5. Verify brief "Changes applied" status message

### Reject Changes
1. Start a new expert instruction flow
2. Wait for diff preview
3. Click "✕ Reject" button (or Alt+Shift+G)
4. Verify temp file is deleted
5. Verify original file is unchanged
6. Verify EditBuffer shows original content
7. Verify brief "Changes rejected" status message

### Cancellation
1. Send an expert instruction
2. Click Cancel while processing
3. Verify state returns to idle
4. Verify cleanup of temp file if needed

### Edge Cases
- No active chat thread: instruction input disabled with message
- File modified externally during processing: warning banner shown
- Very large file: diff computation completes without freezing UI
- Browser crash during processing: temp files cleaned on next load
- `.mimo-expert.tmp` files filtered from file finder results

### Keyboard Shortcuts
- `Alt+Shift+E` toggles expert mode
- `Ctrl+Enter` applies changes in diff preview
- `Alt+Shift+G` rejects changes in diff preview