# VCS Sync Specification

## Overview

This specification defines how the `cleanCopyToUpstream` function should synchronize files between the agent workspace (Fossil checkout) and the upstream repository (Git).

## Functional Requirements

### REQ-001: Preserve Untracked Files
**The system MUST preserve untracked files and directories in upstream during sync.**

Untracked items include:
- `.opencode/` configuration directories
- `.vscode/` editor settings
- `node_modules/` dependency directories
- User-created files not tracked by Git
- Personal notes and documentation

### REQ-002: Delete Intentionally Removed Files
**The system MUST delete files from upstream when they are intentionally removed by the agent via `fossil rm`.**

Only files tracked by Git in upstream can be deleted.

### REQ-003: Copy All Agent Files
**The system MUST copy all files from agent-workspace to upstream, including hidden files.**

Exceptions: VCS metadata directories (`.git/`, `.fossil`, `.fslckout`)

### REQ-004: Overwrite Existing Files
**The system MUST overwrite existing files in upstream with versions from agent-workspace.**

This applies to both tracked and untracked files in upstream.

## Implementation Details

### Algorithm

```
function cleanCopyToUpstream(agentWorkspacePath, upstreamPath):
    // Step 1: Get tracked files from upstream (Git source of truth)
    trackedFiles = gitLsFiles(upstreamPath)
    
    // Step 2: Copy all files from agent to upstream
    copyRecursive(agentWorkspacePath, upstreamPath, exclude=[".git", ".fossil", ".fslckout"])
    
    // Step 3: Delete tracked files no longer in agent
    for file in trackedFiles:
        if not exists(join(agentWorkspacePath, file)):
            deleteFile(join(upstreamPath, file))
```

### VCS Metadata Exclusions

The following items MUST NOT be copied from agent-workspace:
- `.git/` directory
- `.fossil` file
- `.fslckout` directory

### Git Command

Use `git ls-files` to get the list of tracked files:

```bash
cd <upstream-path> && git ls-files
```

Output format: one file path per line, relative to repository root.

## Test Cases

### TC-001: Preserve `.opencode/` Directory
**Given**: Upstream has `.opencode/config.json`
**When**: Agent syncs with no changes
**Then**: `.opencode/config.json` is preserved in upstream

### TC-002: Delete Fossil-Removed File
**Given**: Upstream and agent both have `old-file.txt`
**When**: Agent runs `fossil rm old-file.txt` and commits
**Then**: `old-file.txt` is deleted from upstream after sync

### TC-003: Copy New Hidden File
**Given**: Agent creates `.env.local`
**When**: Agent syncs
**Then**: `.env.local` is copied to upstream

### TC-004: Overwrite Modified File
**Given**: Both have `README.md`, agent modifies it
**When**: Agent syncs
**Then**: Upstream `README.md` is updated with agent's version

### TC-005: Preserve Untracked User Notes
**Given**: Upstream has `my-notes.txt` (untracked)
**When**: Agent syncs with no changes to this file
**Then**: `my-notes.txt` is preserved in upstream
