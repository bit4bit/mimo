# Tasks: Fix cleanCopyToUpstream Deletion Bug

## Tasks

### Task 1: Write Failing Test
- [x] **Verify tests exist** - Tests already in `commits-bug-fix.test.ts`
- [x] **Run tests to confirm failure** - Tests were failing with original implementation

### Task 2: Implement Fixed Algorithm
- [x] **Read current `cleanCopyToUpstream` implementation**
- [x] **Add `fossil ls` and `git ls-files` comparison** to detect deleted files
- [x] **Rewrite sync logic**:
  - Copy all files from agent-workspace to upstream (except VCS metadata)
  - Delete only tracked files missing from fossil's tracked list
  - Preserve all untracked files
- [x] **Exclude VCS metadata** (`.git/`, `.fossil`, `.fslckout`) from copy

### Task 3: Verify Implementation
- [x] **Run existing tests** - All 3 tests in `commits-bug-fix.test.ts` pass
- [x] **Run related test suites** - commits.test.ts and sessions.test.ts pass

## Acceptance Criteria
- [x] `.opencode/` directories are preserved in upstream
- [x] Files deleted via `fossil rm` are removed from upstream
- [x] New files created by agent are copied to upstream
- [x] Hidden files (`.env.local`) are copied to upstream
- [x] All bug fix tests pass

## Implementation Summary

The fix replaces the "nuke and pave" approach with a smart merge:

1. **Get fossil's tracked file list** via `fossil ls` - tells us what files SHOULD exist in the checkout
2. **Get Git's tracked file list** via `git ls-files` - tells us what files are tracked in upstream
3. **Copy logic**: Copy all files from agent to upstream, except:
   - VCS metadata (`.git/`, `.fossil`, `.fslckout`)
   - Files on disk that aren't tracked by fossil (orphaned deleted files)
4. **Delete logic**: Delete from upstream only if:
   - File is tracked in upstream (Git knows about it)
   - AND file is either missing on disk OR not tracked by fossil

This preserves untracked files (`.opencode/`, user notes, etc.) while correctly removing files the agent deleted via `fossil rm`.
