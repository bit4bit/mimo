# Tasks: Add PatchBuffer

## Backend

- [ ] Write failing integration test: `POST /sessions/:sid/patch-buffers` creates record and returns `patchedContent`
- [ ] Write failing integration test: applying replacements in reverse line-order produces correct output
- [ ] Write failing integration test: `GET /sessions/:sid/patch-buffers/:encodedPath` returns 200 or 404
- [ ] Write failing integration test: `POST .../approve` writes file to disk and deletes record
- [ ] Write failing integration test: `DELETE .../patch-buffers/:encodedPath` deletes record without touching file
- [ ] Write failing integration test: session eviction removes all records for that session
- [ ] Implement `PatchBufferService` (in-memory, keyed by `sessionId:filePath`)
  - [ ] `create(sessionId, filePath, originalContent, replacements[])` → applies replacements in reverse line-order, stores record
  - [ ] `get(sessionId, filePath)` → returns record or null
  - [ ] `approve(sessionId, filePath)` → writes file, deletes record
  - [ ] `decline(sessionId, filePath)` → deletes record
  - [ ] `evictSession(sessionId)` → removes all records for session
- [ ] Register REST routes for PatchBuffer (POST, GET, POST/approve, DELETE)
- [ ] Wire `evictSession` to session-delete lifecycle
- [ ] Confirm all backend tests pass

## Frontend: ExpertMode Integration

- [ ] Update `MIMO_EXPERT_UTILS.extractReplacement` to parse new `{replacements: [...]}` schema
- [ ] Update the LLM prompt string in `sendExpertInstruction` to use new array output schema
- [ ] Update `handleExpertDiffReady` to:
  - [ ] Parse `replacements[]` (not single replacement)
  - [ ] Fetch `originalContent` from server
  - [ ] `POST /sessions/:sid/patch-buffers` with filePath + originalContent + replacements
  - [ ] On success: open/activate PatchBuffer tab for the file; reset ExpertMode state to `idle`
  - [ ] On failure: show error status, return to `idle`
- [ ] Remove `diff_preview` state transitions from ExpertMode (no longer used)
- [ ] Remove inline diff rendering (`renderDiffPreview`, `#expert-diff-preview`, `#expert-actions` Approve/Reject wiring in ExpertMode)
- [ ] Confirm ExpertMode tests pass

## Frontend: PatchBuffer Buffer

- [ ] Add `patch-buffer.js` (or integrate into existing frame-buffer JS):
  - [ ] `openPatchBuffer(sessionId, filePath)` — fetches record, opens tab
  - [ ] `renderPatchBuffer(record)` — renders vertical-split diff using `MIMO_DIFF` + `hljs`
  - [ ] Synchronized scroll between left and right panes
  - [ ] Approve button → `POST .../approve` → close tab → mark Edit buffer file outdated
  - [ ] Decline button → `DELETE .../patch-buffers/:encodedPath` → close tab → focus Edit buffer
- [ ] Add tab label `Patch: <filename>` to frame buffer tab bar
- [ ] Implement browser-reload recovery: on mount, fetch record; 404 → auto-close tab
- [ ] Confirm PatchBuffer renders correctly for multi-replacement patch
- [ ] Confirm Approve/Decline buttons stay visible during scroll (sticky header)

## Verification

- [ ] End-to-end: submit expert instruction → LLM returns two replacements → PatchBuffer tab opens with correct diff → Approve → file updated → tab closes → Edit buffer reloads
- [ ] End-to-end: browser reload mid-review → PatchBuffer tab restores from backend
- [ ] End-to-end: Decline → file unchanged → tab closed
- [ ] Two files patched simultaneously → two independent patch tabs, each independently approvable
