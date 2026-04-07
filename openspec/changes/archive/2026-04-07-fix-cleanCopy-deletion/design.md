# Design: Fix cleanCopyToUpstream Deletion Bug

## Current Behavior (Bug)

```typescript
// Current implementation (simplified)
async cleanCopyToUpstream(agentWorkspacePath, upstreamPath) {
  // 1. Preserve only .git and .fossil
  // 2. DELETE EVERYTHING else recursively
  // 3. Copy non-hidden files from agent to upstream
}
```

**Problem**: This deletes untracked user files like `.opencode/`, `.vscode/`, personal notes, etc.

## New Behavior (Fix)

```typescript
// New implementation approach
async cleanCopyToUpstream(agentWorkspacePath, upstreamPath) {
  // 1. Get list of tracked files in upstream (git ls-files)
  const trackedFiles = await getTrackedFiles(upstreamPath);
  //    ["src/app.ts", "README.md", "old-file.txt"]
  
  // 2. Copy ALL files from agent-workspace to upstream
  //    - Overwrites existing tracked files
  //    - Adds new files (both tracked and untracked)
  await copyAllFiles(agentWorkspacePath, upstreamPath);
  
  // 3. Delete tracked files that no longer exist in agent workspace
  for (const file of trackedFiles) {
    if (!existsInAgent(file)) {
      await deleteFromUpstream(file);  // Only deletes intentionally removed files
    }
  }
}
```

## Key Design Decisions

### 1. Source of Truth for Deletions
**Use Git's tracked file list**, not Fossil's.

Reason: Upstream is the Git repository. Files that Git knows about are the only ones that "belong" to the versioned project. Everything else is user data that should be preserved.

### 2. Files to Exclude from Copy
- `.git/` - Git repository metadata
- `.fossil` - Fossil repository file (if exists in agent workspace)
- `.fslckout` - Fossil checkout metadata

### 3. Hidden Files Handling
**Copy hidden files** (files starting with `.`). 

The old code skipped them: `if (entry.name.startsWith(".")) continue;`

This is wrong because:
- `.env.local` might be needed
- `.opencode/` should be preserved in upstream (not copied from agent, but not deleted either)
- Actually, `.opencode/` exists in upstream, not agent, so it won't be copied anyway

Actually, let me reconsider: we should copy ALL files from agent, including hidden ones, because the agent might create `.env.local` or similar. The only things to exclude are VCS metadata.

### 4. Implementation Steps

1. Execute `git ls-files` in upstream to get tracked file list
2. Copy all files from agent-workspace to upstream (recursive, overwrite existing)
3. For each tracked file from step 1, check if it exists in agent-workspace
4. If not present, delete it from upstream
5. Keep all untracked files in upstream untouched

## Edge Cases Handled

| Scenario | Current | New |
|----------|---------|-----|
| `.opencode/` in upstream | ❌ Deleted | ✅ Preserved (untracked) |
| `node_modules/` in upstream | ❌ Deleted | ✅ Preserved (untracked) |
| File deleted via `fossil rm` | ❌ Kept | ✅ Deleted from upstream |
| New file in agent | ✅ Added | ✅ Added |
| Modified tracked file | ✅ Updated | ✅ Updated |
| Agent creates `.env.local` | ❌ Skipped (hidden) | ✅ Copied |

## Testing Strategy

The existing tests in `commits-bug-fix.test.ts` already cover the desired behavior:
1. Preserves `.opencode/` during sync
2. Preserves other untracked directories
3. Deletes files intentionally removed by agent

These tests should pass after the fix.

## Migration Notes

No breaking changes. The function signature remains the same. Only internal logic changes.
