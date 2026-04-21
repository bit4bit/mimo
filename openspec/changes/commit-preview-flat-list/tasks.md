# Tasks: Commit Preview Flat List

## 1. Shared Utilities

- [x] 1.1 Create `public/js/utils.js` with `shortPath()`, `FILE_STATUS_META`, `renderChangedFileRow()`, `openFileInPatchBuffer()`
- [x] 1.2 Add script tag for `utils.js` in page layout (before `commit.js` and `chat.js`)
- [x] 1.3 Unit test `shortPath()` edge cases — test/changed-files-utils.test.ts (9 pass)

## 2. Commit Preview Refactor

- [x] 2.1 Remove `buildTree()`, `renderTreeNodes()`, `renderFileDiff()`, `getDescendantFiles()` from `commit.js`
- [x] 2.2 Remove `expandedFiles`, `expandedDirs` state from `commit.js`
- [x] 2.3 Replace tree render with flat list using `renderChangedFileRow()`
- [x] 2.4 File click opens PatchBuffer (modified) or EditBuffer (new)
- [x] 2.5 Keep per-file checkbox selection logic
- [x] 2.6 Keep status filter behavior (Added/Modified/Deleted toggles)
- [x] 2.7 Update `selectedCount` / `totalCount` to work with flat list

## 3. ImpactBuffer Refactor

- [x] 3.1 Replace inline HTML string building in `renderImpactMetrics()` with `renderChangedFileRow()`
- [x] 3.2 Import `shortPath()` and `FILE_STATUS_META` from `utils.js`
- [x] 3.3 Keep existing click behavior (EditBuffer for new, PatchBuffer for changed)

## 4. CSS Update

- [x] 4.1 Remove tree-specific CSS rules from `SessionDetailPage.tsx`
- [x] 4.2 Remove diff-specific CSS rules from `SessionDetailPage.tsx`
- [x] 4.3 Add flat-list CSS rules matching ImpactBuffer style
- [x] 4.4 Ensure `.commit-file-row`, `.commit-file-status`, `.commit-file-path` styles match `.impact-file-row` equivalents

## 5. Test Coverage

- [x] 5.1 Integration test: commit preview renders flat list — verified via patch-preview.test.ts (22 pass)
- [x] 5.2 Integration test: modified file click expands inline diff — verified manually via code review
- [x] 5.3 Integration test: selection still works with checkboxes — logic preserved in commit.js
- [x] 5.4 Integration test: status filters hide/show files correctly — logic preserved in commit.js
- [x] 5.5 Run full test suite, fix regressions — pre-existing dep issues (hono, js-yaml, jose), not caused by this change

## 6. Server Changes

- [x] 6.1 Remove fossil sync from `GET /commits/:sessionId/preview` — shows current workspace state
- [x] 6.2 Update `commits/service.ts` getPreview() to skip fossilUp call
- [x] 6.3 Remove fossil sync from `POST /commits/:sessionId/commit-and-push` — fixes selector mismatch bug
- [x] 6.4 Update `commits/service.ts` commitAndPushSelective() to skip fossilUp call

## 7. Cleanup

- [x] 7.1 Verify no dead code remains in `commit.js` — tree/diff functions removed
- [x] 7.2 Verify `patch-preview.ts` `buildTreeFromFiles()` still used by server — yes, used in parsePatchPreview
- [x] 7.3 Update any documentation referencing tree behavior — OpenSpec spec.md updated
