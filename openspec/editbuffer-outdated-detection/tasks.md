# Tasks: EditBuffer Outdated File Detection

## Prerequisites
- [ ] Install chokidar: `bun add chokidar` in packages/mimo-platform
- [ ] Add @types/chokidar if needed for TypeScript

## Server-Side Tasks

### File Watcher Service
- [ ] Create `src/files/file-watcher-service.ts`
  - Implement createFileWatcherService() factory
  - Implement watchFile() with chokidar
  - Implement unwatchFile() for cleanup
  - Implement unwatchAll() for session cleanup
  - Implement computeChecksum() using crypto
  - Add debouncing (300ms) for change events
- [ ] Export FileWatcherService interface from `src/files/types.ts`
- [ ] Create unit tests for file-watcher-service.ts
  - Test watchFile adds file to watcher
  - Test unwatchFile removes file
  - Test checksum computation
  - Test debouncing behavior

### WebSocket Endpoint
- [ ] Create WebSocket route `/ws/sessions/:id/files`
  - Add to sessions/routes.tsx or create separate ws handler
  - Handle watch_file/unwatch_file messages from client
  - Send file_outdated/file_deleted events to client
  - Cleanup watchers on disconnect
- [ ] Create integration test for WebSocket events
  - Test watch_file message handling
  - Test file change detection and notification
  - Test disconnect cleanup

### Dependency Injection
- [ ] Add fileWatcherService to MimoContext
  - Update context type definition
  - Initialize in index.tsx
  - Pass to sessions routes

## Client-Side Tasks

### EditBuffer State Extension (edit-buffer.js)
- [ ] Add computeChecksum(content) function
  - Use SubtleCrypto.digest if available
  - Fallback to simple hash for older browsers
- [ ] Extend OpenFile object with:
  - contentChecksum field (string)
  - isOutdated field (boolean)
- [ ] Add markOutdated(path) function
- [ ] Add clearOutdated(path) function
- [ ] Add reloadFile(path, sessionId, callback) function
  - Save scroll position before fetch
  - Fetch new content from `/sessions/:id/files/content`
  - Update content and checksum
  - Clear outdated flag
  - Restore scroll position after render
- [ ] Update persist() to include contentChecksum
- [ ] Update fetchAndAddFile to compute and store checksum

### WebSocket Integration (edit-buffer.js)
- [ ] Add initWebSocket() function
  - Connect to `/ws/sessions/:id/files`
  - Listen for file_outdated events
  - Listen for file_deleted events
  - Reconnect on disconnect (with backoff)
- [ ] Add notifyWatchFile(sessionId, file) function
  - Send watch_file message when file opened
- [ ] Add notifyUnwatchFile(sessionId, path) function
  - Send unwatch_file message when file closed
- [ ] Wire notifyWatchFile into fetchAndAddFile callback
- [ ] Wire notifyUnwatchFile into remove() function

### UI Changes (EditBuffer.tsx)
- [ ] Add outdated indicator span to context bar
  - Display: none by default
  - Orange dot + "Outdated" text
- [ ] Add reload button to context bar
  - Display: none by default
  - "↻ Reload" label
  - title="Reload file (Alt+Shift+R)"

### UI Logic (edit-buffer.js)
- [ ] Update renderContextBar() to show/hide outdated indicator
- [ ] Update renderContextBar() to show/hide reload button
- [ ] Add reload button event listener in init()
- [ ] Wire reload button to reloadCurrentFile function

### Keybinding (session-keybindings.js)
- [ ] Add `reloadFile: "Alt+Shift+R"` to DEFAULT_KEYBINDINGS
- [ ] Add reloadFile to configurable keybindings loading
- [ ] Add keydown handler for reloadFile
  - Call window.EditBuffer.reloadCurrentFile()
  - Prevent default if handled

### Exposed API (edit-buffer.js)
- [ ] Add reloadCurrentFile to window.EditBuffer object

## Testing Tasks

### Unit Tests
- [ ] Test computeChecksum produces consistent hashes
- [ ] Test markOutdated updates state and triggers render
- [ ] Test reloadFile fetches and updates content
- [ ] Test scroll position preservation

### Integration Tests
- [ ] Test full flow: open file -> modify externally -> see outdated indicator
- [ ] Test reload button updates content
- [ ] Test Alt+Shift+R keyboard shortcut reloads file
- [ ] Test scroll position preserved after reload
- [ ] Test multiple files: only active file shows outdated indicator
- [ ] Test file deletion shows outdated indicator

### E2E Tests
- [ ] Simulate agent modifying file while user has it open
- [ ] Verify user sees notification and can reload

## Verification Checklist
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] Manual test: Open file, edit externally, see outdated indicator
- [ ] Manual test: Click reload button, content updates
- [ ] Manual test: Press Alt+Shift+R, content updates
- [ ] Manual test: Scroll position preserved after reload
- [ ] Manual test: Switching between files shows correct outdated state
- [ ] Manual test: Close file, reopen - outdated state cleared

## Files to Modify
1. `packages/mimo-platform/package.json` - add chokidar dependency
2. `packages/mimo-platform/src/files/file-watcher-service.ts` - NEW
3. `packages/mimo-platform/src/files/types.ts` - extend types
4. `packages/mimo-platform/src/sessions/routes.tsx` - add WebSocket route
5. `packages/mimo-platform/src/context/mimo-context.ts` - add to context
6. `packages/mimo-platform/src/index.tsx` - initialize service
7. `packages/mimo-platform/src/buffers/EditBuffer.tsx` - UI changes
8. `packages/mimo-platform/public/js/edit-buffer.js` - state & logic
9. `packages/mimo-platform/public/js/session-keybindings.js` - keybinding
