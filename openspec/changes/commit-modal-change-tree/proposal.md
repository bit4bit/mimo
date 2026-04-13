# Proposal: Commit Modal Change Tree and Selective Apply

## Why

The current commit flow applies all detected changes without a review and selection step. Users need a focused pre-commit review experience where they can inspect a tree of changed files, expand modified files to inspect diffs, and choose exactly which file-level statuses should be applied.

## What Changes

- Add a commit preview experience inside the existing Commit modal
- Display a scrollable tree of changed files grouped by directory
- Support file-level statuses: Added, Modified, Deleted
- Allow selecting/deselecting individual files
- Allow selecting a directory to apply all descendant files (tri-state parent behavior)
- Allow expanding modified files to preview unified diff hunks
- Require a non-empty commit message before enabling Commit & Push
- Place commit message input directly above the Commit & Push action row
- Apply only selected files/statuses during patch application and commit flow

## Capabilities

### New Capabilities
- `commit-review-selection`: interactive commit review and selective patch application from the commit modal

### Modified Capabilities
- `session-management`: commit modal behavior and commit route payloads extended for selection-aware commits

## Impact

- **Frontend**: commit modal UI in `SessionDetailPage.tsx` and behavior in `public/js/commit.js`
- **Backend routes**: new preview endpoint and extended commit endpoint payload handling
- **VCS layer**: patch parsing/filtering for per-file selective apply
- **Testing**: integration coverage for preview metadata, selection behavior, and mandatory message enforcement
