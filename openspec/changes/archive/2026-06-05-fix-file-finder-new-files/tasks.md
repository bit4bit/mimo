## 1. Server: Replace fossil ls with filesystem directory walk

- [x] 1.1 Write failing test: `listFiles` returns files not tracked by VCS (new file on disk appears in listing)
- [x] 1.2 Write failing test: `listFiles` excludes VCS-internal directories (`.git`, `.fossil`, etc.)
- [x] 1.3 Write failing test: `listFiles` respects `.gitignore` and `.mimoignore` patterns
- [x] 1.4 Write failing test: `listFiles` does not return deleted files
- [x] 1.5 Implement `readdir`-based recursive directory walk in `createFileService.listFiles`, replacing `fossilLs`
- [x] 1.6 Make all `listFiles` tests pass
- [x] 1.7 Remove `fossilLs` function from `service.ts`

## 2. Agent: Detect new files in handleWriteFile

- [x] 2.1 Write failing test: `handleWriteFile` sends `isNew: true` when writing a file that does not exist on disk
- [x] 2.2 Write failing test: `handleWriteFile` sends `isNew: false` when overwriting an existing file
- [x] 2.3 Implement `os.fs.exists` check before write in `handleWriteFile` and set `isNew` accordingly
- [x] 2.4 Make all `handleWriteFile` tests pass

## 3. Server: Forward file_list_invalidated event to browser

- [x] 3.1 Write failing test: when platform receives `file_changed` from agent, it sends `file_list_invalidated` to browser WebSocket clients
- [x] 3.2 Implement `file_list_invalidated` event forwarding in `handleFileChanged` (message-router)
- [x] 3.3 Write failing test: browser WebSocket handler passes `file_list_invalidated` events to connected clients
- [x] 3.4 Make all server-side WebSocket forwarding tests pass

## 4. Client: Invalidate file finder cache on file_list_invalidated

- [x] 4.1 Write failing test: receiving `file_list_invalidated` WebSocket event resets `fileFinderLoaded` to `false`
- [x] 4.2 Write failing test: opening file finder after cache invalidation re-fetches file list from server
- [x] 4.3 Write failing test: opening file finder without prior invalidation uses cached list
- [x] 4.4 Implement `file_list_invalidated` handler in `edit-buffer.js` that sets `fileFinderLoaded = false`
- [x] 4.5 Make all client-side cache invalidation tests pass