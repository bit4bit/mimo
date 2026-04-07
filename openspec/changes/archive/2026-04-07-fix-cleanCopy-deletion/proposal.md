# Proposal: Fix cleanCopyToUpstream to Preserve Untracked Files

## Summary
Fix the `cleanCopyToUpstream` function in the VCS module to preserve untracked files in upstream while correctly deleting only files that were intentionally removed by the agent via `fossil rm`.

## Problem Statement
The current `cleanCopyToUpstream` implementation uses a "nuke and pave" approach:
1. Preserves only `.git` and `.fossil` directories
2. **Deletes ALL other files** in upstream
3. Copies everything from agent-workspace to upstream

This destroys user-created files like `.opencode/`, `.vscode/`, `node_modules/`, and personal notes that exist in upstream but weren't tracked by fossil.

## Proposed Solution
Implement a simple merge strategy using Git's `ls-files` to determine deletions:

1. **Get tracked files in upstream** via `git ls-files` - these are the only files that can be safely deleted
2. **Copy ALL files** from agent-workspace to upstream (merge, don't replace)
3. **Delete from upstream** only tracked files that no longer exist in agent-workspace
4. **Preserve** all untracked files automatically

## Scope
- Modify `cleanCopyToUpstream` in `packages/mimo-platform/src/vcs/index.ts`
- Preserve existing tests in `commits-bug-fix.test.ts`
- Ensure tests pass after implementation

## Success Criteria
- `.opencode/`, `.vscode/`, `node_modules/` directories are preserved during sync
- Files deleted via `fossil rm` are correctly removed from upstream
- New files created by agent are copied to upstream
- Existing tests pass
