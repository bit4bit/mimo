## Context

The current `cleanCopyToUpstream` method in `vcs/index.ts` synchronizes agent-workspace to upstream by:
1. Listing fossil-tracked files (`fossil ls`)
2. Listing upstream-tracked files (`git ls-files`)
3. Copying files one-by-one with `copyFileSync`
4. Deleting files from upstream that were removed in agent-workspace

This works but: (a) leaves no record of what changed per sync cycle, (b) uses custom file-walking logic that has accumulated edge cases (VCS metadata exclusions, `fossil rm` without unlink), and (c) only supports git upstream (uses `git ls-files` even when upstream is fossil).

The session directory structure is fixed:
```
sessions/{projectId}/{sessionId}/
├── session.yaml
├── upstream/          (git or fossil checkout)
└── agent-workspace/   (fossil checkout)
```

Both directories share the same parent, which is key for `git diff --no-index`.

## Goals / Non-Goals

**Goals:**
- Replace file-copy sync with patch-based sync (generate diff, store, apply)
- Store every patch as a historical artifact in `session/patches/`
- Support both git and fossil upstream repos
- Handle all file states: new, modified, deleted, untracked, `fossil rm`-without-unlink

**Non-Goals:**
- Patch replay/revert from UI (patches are stored for audit, not interactive use)
- `git apply --check` for pre-validation (no conflicts expected in this flow)
- Changes to the `FileSyncService` in `sync/service.ts` (that handles real-time file change events, separate from the commit-time sync)
- Changes to the fossil server or agent communication protocol

## Decisions

### 1. Use `git diff --binary --no-index` for patch generation

**Choice**: Run `git diff --binary --no-index -- upstream/ agent-workspace/` from the session directory.

**Why over alternatives**:
- `diff -ur` (POSIX): doesn't handle binary files well, no `--binary` equivalent
- Per-file `diff -u`: requires assembling individual diffs, handling new/deleted files manually
- Git index manipulation (`GIT_INDEX_FILE`): complex, tightly coupled to git internals

`git diff --no-index` compares directory trees regardless of VCS, handles binary files with `--binary`, and produces standard git-format patches that both `git apply` and `patch -p1` understand.

**Exit code handling**: `git diff --no-index` returns 0 (no diff), 1 (has diff), >1 (error). The current `execCommand` treats non-zero as failure. The `generatePatch` method SHALL treat exit code 1 as success.

### 2. Path normalization via string replacement

**Choice**: After generating the patch, replace `a/upstream/` with `a/` and `b/agent-workspace/` with `b/` in diff headers.

**Why**: Since the directory names are fixed (`upstream/` and `agent-workspace/`), this is a deterministic string replacement, not a fragile regex. The normalized patch has relative paths like `a/src/app.ts` that `git apply` and `patch -p1` can apply directly in the upstream directory.

Lines to transform:
```
diff --git a/upstream/X b/agent-workspace/X  →  diff --git a/X b/X
--- a/upstream/X                             →  --- a/X
+++ b/agent-workspace/X                      →  +++ b/X
rename from upstream/X                       →  rename from X
rename to agent-workspace/X                  →  rename to X
```

### 3. Pre-processing with `alignWorkspaceWithFossil`

**Choice**: Before generating the patch, run `fossil changes` on agent-workspace (and on upstream if fossil) to detect files marked as DELETED by fossil but still present on disk. Physically delete those files so the directory tree reflects fossil's intent.

**Why**: `fossil rm` removes from tracking but doesn't delete from disk. Without this step, `git diff --no-index` wouldn't detect the deletion because the file exists in both trees.

### 4. VCS metadata filtering via post-processing

**Choice**: After generating and normalizing the patch, remove diff hunks for files matching VCS metadata patterns (`.fslckout`, `.fossil`, `_FOSSIL_`, `.fslckout-journal`).

**Why**: These files exist in agent-workspace but not upstream. They'd appear as "new file" diffs. Filtering after generation is simpler and more reliable than trying to exclude them in the `git diff` command (pathspec exclusions don't work reliably with `--no-index`).

### 5. Apply strategy per upstream type

**Choice**:
- Git upstream: `git apply --binary {patchFile}` in upstream directory
- Fossil upstream: `patch -p1 < {patchFile}` in upstream directory (POSIX `patch` command)

**Why**: `git apply` is the natural counterpart for git repos and handles binary patches. For fossil upstream, there's no `fossil apply`, but POSIX `patch -p1` handles unified diffs. Binary diffs in git format won't apply with `patch -p1`, but binary files in fossil upstream repos are an edge case we accept as a limitation.

### 6. Patch storage in session directory

**Choice**: Store patches at `sessions/{projectId}/{sessionId}/patches/{ISO-timestamp}.patch`

**Why**: Colocated with the session, easy to list chronologically, doesn't pollute the session.yaml. Timestamp format uses `-` instead of `:` for filesystem compatibility (e.g., `2026-04-10T10-30-00Z.patch`).

## Risks / Trade-offs

- **[Binary files on fossil upstream]** `patch -p1` cannot apply git binary diffs. Mitigation: this is an uncommon case (most agent changes are text files). If needed in the future, fall back to `copyFileSync` for binary-only changes.
- **[Large patches]** Sessions with many file changes could produce large `.patch` files. Mitigation: patches are text (compressible), and disk space is not a constraint for session data.
- **[`git` dependency for diff generation]** `git diff --no-index` requires git to be installed even when upstream is fossil. Mitigation: git is already a required dependency for mimo (used in cloning, committing, pushing).
- **[Path normalization fragility]** If session directory structure changes (e.g., `upstream/` renamed), the string replacement breaks. Mitigation: directory names are hardcoded in `SessionRepository` and unlikely to change. The replacement uses the actual directory basenames, not hardcoded strings.
