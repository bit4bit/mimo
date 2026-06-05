## 1. Server: Replace fossil ls with filesystem directory walk

- [ ] 1.1 Write failing test: `listFiles` returns files not tracked by VCS (new file on disk appears in listing)
- [ ] 1.2 Write failing test: `listFiles` excludes VCS-internal directories (`.git`, `.fossil`, etc.)
- [ ] 1.3 Write failing test: `listFiles` respects `.gitignore` and `.mimoignore` patterns
- [ ] 1.4 Write failing test: `listFiles` does not return deleted files
- [ ] 1.5 Implement `readdir`-based recursive directory walk in `createFileService.listFiles`, replacing `fossilLs`
- [ ] 1.6 Make all `listFiles` tests pass
- [ ] 1.7 Remove `fossilLs` function from `service.ts`

## 2. Agent: Detect new files in handleWriteFile

- [ ] 2.1 Write failing test: `handleWriteFile` sends `isNew: true` when writing a file that does not exist on disk
- [ ] 2.2 Write failing test: `handleWriteFile` sends `isNew: false` when overwriting an existing file
- [ ] 2.3 Implement `os.fs.exists` check before write in `handleWriteFile` and set `isNew` accordingly
- [ ] 2.4 Make all `handleWriteFile` tests pass

## 3. Server: Forward file_list_invalidated event to browser

- [ ] 3.1 Write failing test: when platform receives `file_changed` from agent, it sends `file_list_invalidated` to browser WebSocket clients
- [ ] 3.2 Implement `file_list_invalidated` event forwarding in `handleFileChanged` (message-router)
- [ ] 3.3 Write failing test: browser WebSocket handler passes `file_list_invalidated` events to connected clients
- [ ] 3.4 Make all server-side WebSocket forwarding tests pass

## 4. Client: Invalidate file finder cache on file_list_invalidated

- [ ] 4.1 Write failing test: receiving `file_list_invalidated` WebSocket event resets `fileFinderLoaded` to `false`
- [ ] 4.2 Write failing test: opening file finder after cache invalidation re-fetches file list from server
- [ ] 4.3 Write failing test: opening file finder without prior invalidation uses cached list
- [ ] 4.4 Implement `file_list_invalidated` handler in `edit-buffer.js` that sets `fileFinderLoaded = false`
- [ ] 4.5 Make all client-side cache invalidation tests pass