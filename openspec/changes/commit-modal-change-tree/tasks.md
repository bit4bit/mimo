# Tasks: Commit Modal Change Tree and Selective Apply

## 1. Preview Model and Parsing

- [ ] 1.1 Add a patch preview parser that extracts file-level status and modified-file hunks
- [ ] 1.2 Build tree metadata from file paths for directory rendering
- [ ] 1.3 Add parser handling for binary files and metadata-only changes
- [ ] 1.4 Add integration tests for added/modified/deleted parsing
- [ ] 1.5 Add integration tests for binary-file metadata preview and whole-file selective apply

## 2. Commit Routes and Service

- [ ] 2.1 Add `GET /commits/:sessionId/preview` endpoint
- [ ] 2.2 Extend commit endpoint payload to accept selected paths and status toggles
- [ ] 2.3 Validate server-side that selected paths exist in preview set
- [ ] 2.4 Filter patch application to selected paths before commit
- [ ] 2.5 Keep existing push behavior unchanged after selective apply

## 3. Commit Modal UI

- [ ] 3.1 Render preview tree in commit modal with status badges
- [ ] 3.2 Add file and directory checkboxes with tri-state directory behavior
- [ ] 3.3 Add expandable modified-file diff hunks
- [ ] 3.4 Add Added/Modified/Deleted status filter toggles
- [ ] 3.5 Make tree panel independently scrollable for long change sets
- [ ] 3.6 Move commit message input to just above action buttons

## 4. Validation and UX Rules

- [ ] 4.1 Require non-empty commit message (trimmed)
- [ ] 4.2 Disable Commit & Push when no files are selected
- [ ] 4.3 Show selected file count and empty-state guidance
- [ ] 4.4 Add clear error messaging for preview/apply failures

## 5. Test Coverage (BDD Integration First)

- [ ] 5.1 Failing integration test: preview endpoint returns correct tree/statuses
- [ ] 5.2 Failing integration test: directory selection applies all descendants
- [ ] 5.3 Failing integration test: modified file expands with diff hunks
- [ ] 5.4 Failing integration test: empty message blocks commit submission
- [ ] 5.5 Failing integration test: selective apply commits only chosen files
