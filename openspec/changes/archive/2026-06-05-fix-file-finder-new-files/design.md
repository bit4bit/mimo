## Context

The file finder lists files using `fossil ls`, which only returns VCS-tracked files. When the LLM agent creates a new file, it writes directly to the filesystem without running `fossil add`, so the new file:
1. Exists on disk (readable via `/files/content?path=`)
2. Does NOT appear in `fossil ls` output (invisible in the file finder)

Additionally, the client-side file finder caches its file list in module-scope variables (`allFiles`, `fileFinderLoaded`) and never re-fetches, so even if the server listing were fixed, new files wouldn't appear until a full page reload.

The agent-side `handleWriteFile` always sends `isNew: false` in `file_changed` events, preventing downstream systems from distinguishing new files from modifications.

## Goals / Non-Goals

**Goals:**
- Files created by the LLM appear in the file finder immediately without a page reload
- File listing reflects the actual filesystem, not just VCS-tracked files
- Agent correctly reports `isNew: true` for newly created files
- Client-side file finder cache invalidates when files change

**Non-Goals:**
- Replacing the VCS layer — `fossil` is still used for version control operations; only listing is changing
- Implementing real-time file tree synchronization (e.g., watching for directory-level changes) — cache invalidation on known events is sufficient
- Changing how file content is read or written

## Decisions

### Decision 1: Replace `fossil ls` with filesystem `readdir` walk

**Choice**: Use `os.fs.readdir` with recursive directory walk, filtered by `isExcluded` and ignore patterns.

**Alternatives considered**:
- **`fossil ls` + `fossil extras`**: Could combine tracked and untracked files via `fossil extras`. Rejected because `fossil extras` has different output format, still misses files created between calls, and couples the listing to VCS internals.
- **`fossil add` on file creation**: Keep `fossil ls` but run `fossil add` whenever a new file is written. Rejected because it adds VCS state management responsibility to the write path and could interfere with the user's VCS workflow.

**Rationale**: The filesystem is the source of truth for what files exist. `isExcluded` already filters VCS internals (`.git`, `.fossil`, etc.) and the ignore pattern machinery already handles `.gitignore` / `.mimoignore`. Using `readdir` aligns the listing with reality and removes the VCS coupling.

### Decision 2: Cache invalidation via WebSocket event

**Choice**: When the platform receives a `file_changed` event from the agent, forward a `file_list_invalidated` event to the browser's file watcher WebSocket connection. The client resets `fileFinderLoaded = false` on receiving this event, causing the next file finder open to re-fetch.

**Alternatives considered**:
- **Polling**: Periodically re-fetch the file list. Rejected because it's wasteful and adds latency.
- **Directory watcher on client**: Use the File System Access API. Rejected because browser security model prevents this.

**Rationale**: The agent already sends `file_changed` events. The platform already handles them. Adding a lightweight notification to the browser via the existing WebSocket is minimal and deterministic.

### Decision 3: Detect new files in agent `handleWriteFile`

**Choice**: Before writing, check `os.fs.exists(fullPath)`. If the file doesn't exist, set `isNew: true` in the `file_changed` event.

**Rationale**: This is a 2-line fix that corrects the data flowing through the system. The `file-sync` spec already defines `isNew: true` for new files — the implementation just needs to match.

## Risks / Trade-offs

- **[Performance] `readdir` walk vs `fossil ls`**: Walking a large directory tree is slower than `fossil ls`. Mitigated by: (a) most projects have manageable file counts, (b) ignore patterns prune large subtrees early, (c) the walk can be short-circuited for excluded directories.
- **[Correctness] Ignored files appearing**: `fossil ls` naturally excludes ignored files; with `readdir` we must rely on the ignore pattern system. Mitigated by: the ignore pattern system already exists and handles `.gitignore` / `.mimoignore` patterns.
- **[Race condition] File created between list and open**: Inherently exists regardless of listing method. No worse than before.