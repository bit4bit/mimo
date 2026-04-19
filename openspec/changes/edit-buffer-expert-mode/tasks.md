## Tasks

### Proposal
- [x] Create `openspec/changes/edit-buffer-expert-mode/proposal.md`

### Design
- [x] Create `openspec/changes/edit-buffer-expert-mode/design.md`

### Specs
- [x] Create `openspec/changes/edit-buffer-expert-mode/specs/expert-mode/spec.md`
- [x] Create `openspec/changes/edit-buffer-expert-mode/specs/patch-buffer/spec.md`

### Tasks
- [x] Create `openspec/changes/edit-buffer-expert-mode/tasks.md` (this file)

---

### Implementation

#### 1. Server-Side: Expert Service — Patch File Operations
- [x] Update `packages/mimo-platform/src/files/expert-service.ts`
  - Add `writePatchFile(workspacePath, originalPath, content)` — writes to `.mimo-patches/<originalPath>`, creates parent dirs
  - Add `approvePatch(workspacePath, originalPath)` — reads `.mimo-patches/<originalPath>`, writes to `<originalPath>`, deletes patch file
  - Add `declinePatch(workspacePath, patchPath)` — deletes patch file; `patchPath` must start with `.mimo-patches/`
  - Add `listPatchFiles(workspacePath)` — returns `Array<{ originalPath, patchPath }>` for all files in `.mimo-patches/`
  - Path traversal protection on all functions
  - Keep existing `readFileContent()` and `writeFileContent()`

#### 2. Server-Side: Patch Routes
- [x] Add patch routes in `packages/mimo-platform/src/sessions/routes.tsx`
  - `GET /sessions/:id/patches` — list pending patches via `listPatchFiles()`
  - `POST /sessions/:id/patches` — write patch file via `writePatchFile()`, return `{ patchPath }`
  - `POST /sessions/:id/patches/approve` — approve via `approvePatch()`; validate patchPath starts with `.mimo-patches/`
  - `DELETE /sessions/:id/patches` — decline via `declinePatch()`; validate patchPath starts with `.mimo-patches/`
  - All routes require auth cookie

#### 3. Server-Side: Filter `.mimo-patches/` from File Listings
- [x] Update `packages/mimo-platform/src/files/service.ts`
  - Add `.mimo-patches/` to default ignore patterns in `loadIgnorePatterns()`
- [x] Update file watcher to exclude `.mimo-patches/` from `file_outdated` and `file_deleted` events

#### 4. Server-Side: WebSocket Expert Instruction Handler
- [x] Update `packages/mimo-platform/src/index.tsx`
  - Handle `expert_instruction` message type — track pending expert sessions
  - On `usage_update` for tracked thread, send `expert_diff_ready` to client
  - Handle `cancel_request` — clear pending expert state

#### 5. Client-Side: Expert Mode State (Simplified)
- [x] Update `packages/mimo-platform/public/js/edit-buffer.js`
  - Remove `modifiedContent` and `diff_preview` state from `ExpertMode`
  - Remove all diff rendering functions from ExpertMode (stacked panes, apply/reject buttons)
  - Update `ExpertMode` state: `{ enabled, state (off/idle/processing), inputVisible, focusRange, focusGuideSize, originalPath, originalContent, instruction }`
  - Update `handleExpertDiffReady(data)`:
    - Extract JSON replacement via `MIMO_EXPERT_UTILS.extractReplacement()`
    - Apply replacement via `MIMO_EXPERT_UTILS.applyReplacement()` → `patchedContent`
    - POST to `/sessions/:id/patches` with `{ originalPath, content: patchedContent }`
    - Call `window.MIMO_PATCH_BUFFER.addPatch({ sessionId, originalPath, patchPath })`
    - Clear `originalContent`; transition to `"idle"`
    - Show "Patch sent to PatchBuffer" toast
  - Update `cancelExpertProcessing()` — remove stale `DELETE /files/temp` fetch; only send `cancel_request` and reset state
  - Remove `applyExpertChanges()`, `rejectExpertChanges()`, `renderDiffPreview()`, `renderExpertActions()`
  - Add focus guide size state (`focusGuideSize`, default 7, min 3)
  - Add `increaseFocusGuideSize()` — `focusGuideSize += 2`, re-render
  - Add `decreaseFocusGuideSize()` — `focusGuideSize = max(3, focusGuideSize - 2)`, re-render
  - Update `computeFocusGuide()` to use `focusGuideSize`
  - Add patch recovery on init: call `GET /sessions/:id/patches`, call `MIMO_PATCH_BUFFER.addPatch()` for each

#### 6. Client-Side: EditBuffer.tsx HTML Shell Cleanup
- [x] Update `packages/mimo-platform/src/buffers/EditBuffer.tsx`
  - Remove diff preview container (`id="expert-diff-preview"`)
  - Remove Apply/Reject/Cancel actions containers (`id="expert-actions"`, `id="expert-cancel-btn"`)
  - Keep: expert mode toggle button, thread selector, thread name, focus guide overlay, instruction input

#### 7. Client-Side: PatchBuffer Component
- [x] Create `packages/mimo-platform/src/buffers/PatchBuffer.tsx`
  - Server-rendered HTML shell: tabs bar, context bar (file path, Approve/Decline buttons), split container (left/right panes), empty state
  - Register in buffer registry (`packages/mimo-platform/src/buffers/registry.ts`)
- [x] Create `packages/mimo-platform/public/js/patch-buffer.js`
  - `PatchBufferState`: `{ tabs: PatchTab[], activeIndex }`
  - `PatchTab`: `{ sessionId, originalPath, patchPath, originalContent, patchedContent }`
  - `addPatch({ sessionId, originalPath, patchPath })` — adds or updates tab, loads content, renders diff; exposed as `window.MIMO_PATCH_BUFFER.addPatch`
  - `approve()` — POST patches/approve, close tab, toast
  - `decline()` — DELETE patches, close tab, toast
  - `loadPatchContent(tab)` — fetch both files via `/files/content`, unescape, store in tab
  - `renderDiff(tab)` — `MIMO_DIFF.computeDiff(originalContent, patchedContent)`, render vertical split
  - `renderTabs()` — render tab bar with close buttons
  - `updateContextBar()` — update file path display and button state
  - `showStaleWarning(originalPath)` — show warning banner when file_outdated fires for an open patch
  - Expose `window.MIMO_PATCH_BUFFER = { addPatch }`

#### 8. Client-Side: Keybindings
- [x] Update `packages/mimo-platform/public/js/session-keybindings.js`
  - Add `increaseFocus: "Alt+Control+ArrowUp"` — increase focus guide size by 2
  - Add `decreaseFocus: "Alt+Control+ArrowDown"` — decrease focus guide size by 2 (min 3)
  - Remove `confirmExpertChanges` and `rejectExpertChanges` bindings from EditBuffer (move to PatchBuffer)
  - Add `approvePatch: "Ctrl+Enter"` — approve active patch (when PatchBuffer is focused)
  - Add `declinePatch: "Alt+Shift+G"` — decline active patch (when PatchBuffer is focused)
  - Focus guard: `increaseFocus`/`decreaseFocus` only fire when expert mode is enabled and not in `processing`
- [x] Update `packages/mimo-platform/src/config/service.ts`
  - Add `increaseFocus`, `decreaseFocus`, `approvePatch`, `declinePatch` to `SessionKeybindingsConfig`
- [x] Update `packages/mimo-platform/src/config/validator.ts`
  - Add new keybindings to valid list

#### 9. Client-Side: Load patch-buffer.js
- [x] Update `packages/mimo-platform/src/components/Layout.tsx`
  - Add `<script src="/js/patch-buffer.js" defer></script>` (after `diff.js` and `expert-utils.js`)

#### 10. Client-Side: Keyboard Shortcuts Bar
- [x] Update `packages/mimo-platform/src/components/SessionDetailPage.tsx`
  - Replace "Ctrl+Enter Apply / Alt+Shift+G Reject" EditBuffer shortcuts with "Ctrl+Enter Approve / Alt+Shift+G Decline" PatchBuffer shortcuts
  - Add "Alt+Control+↑/↓ Focus size" shortcuts

#### 11. Testing

##### 11.1 Unit Tests: Expert Service — Patch Operations
- [x] Update `packages/mimo-platform/test/expert-mode-service.test.ts`
  - Test `writePatchFile()` creates `.mimo-patches/<path>`, creates parent dirs
  - Test `writePatchFile()` rejects `..` in path
  - Test `approvePatch()` copies patch content to original path
  - Test `approvePatch()` deletes patch file after copying
  - Test `approvePatch()` throws if patch file not found
  - Test `declinePatch()` deletes patch file
  - Test `declinePatch()` rejects patchPath not starting with `.mimo-patches/`
  - Test `listPatchFiles()` returns correct originalPath/patchPath pairs

##### 11.2 Integration Tests: Patch API
- [x] Update `packages/mimo-platform/test/expert-mode-api.test.ts`
  - Test `POST /sessions/:id/patches` writes patch file, returns patchPath
  - Test `GET /sessions/:id/patches` lists pending patches
  - Test `POST /sessions/:id/patches/approve` copies patch → original, deletes patch
  - Test `DELETE /sessions/:id/patches` deletes patch file
  - Test security: reject `originalPath` with `..`
  - Test security: reject `patchPath` not starting with `.mimo-patches/`

##### 11.3 Unit Tests: Diff (existing, keep)
- [x] `packages/mimo-platform/test/diff.test.ts` — all passing

##### 11.4 Unit Tests: Expert Utils (existing, keep)
- [x] `packages/mimo-platform/test/expert-utils.test.ts` — all passing

---

### Verification Steps

#### Expert Mode — Sending an Instruction
1. Open a file in EditBuffer
2. Press `Alt+Shift+E` — expert mode activates, focus guide appears
3. Press `Enter` — instruction input appears at bottom
4. Type an instruction, press `Ctrl+Enter`
5. EditBuffer shows "Processing..." state
6. After LLM responds: EditBuffer shows "Patch sent to PatchBuffer" toast and returns to idle
7. PatchBuffer shows a new tab for the edited file
8. Verify `.mimo-patches/<path>` exists on disk
9. Verify no modifications to the original file yet

#### PatchBuffer — Approve
1. Open PatchBuffer, select the patch tab
2. Verify left pane shows ORIGINAL, right pane shows PATCHED
3. Verify removed lines highlighted red in left pane, added lines green in right pane
4. Click "✓ Approve"
5. Verify tab closes, original file updated on disk
6. Verify `.mimo-patches/<path>` deleted
7. Verify EditBuffer refreshes if file was open

#### PatchBuffer — Decline
1. Open PatchBuffer, select the patch tab
2. Click "✕ Decline"
3. Verify tab closes, original file unchanged
4. Verify `.mimo-patches/<path>` deleted

#### Focus Guide Size
1. Enable expert mode
2. Press `Alt+Control+ArrowUp` — focus guide expands by 2 lines
3. Press `Alt+Control+ArrowDown` — focus guide shrinks by 2 lines (minimum 3)
4. Toggle expert mode off and on — size resets to 7

#### Patch Recovery on Reload
1. Send an expert instruction, let PatchBuffer receive it
2. Reload the page
3. PatchBuffer should re-show the pending patch tab (recovered from `.mimo-patches/`)
