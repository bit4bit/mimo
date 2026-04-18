# Spec: File Watcher Service

## Responsibility
Server-side service that watches files for external changes and notifies clients via WebSocket when opened files become outdated.

## Interface

```typescript
// File: src/files/file-watcher-service.ts

export interface FileWatcherService {
  /**
   * Start watching a file for the given session.
   * When the file changes on disk, the service computes a checksum
   * and notifies the session's WebSocket if content differs.
   */
  watchFile(sessionId: string, filePath: string, currentChecksum: string): Promise<void>;
  
  /**
   * Stop watching a specific file for a session.
   */
  unwatchFile(sessionId: string, filePath: string): void;
  
  /**
   * Stop watching all files for a session (cleanup).
   */
  unwatchAll(sessionId: string): void;
  
  /**
   * Compute MD5 checksum of file content.
   */
  computeChecksum(filePath: string): Promise<string>;
}

export function createFileWatcherService(): FileWatcherService;
```

## Behavior

### Watch File
- Adds file path to chokidar watcher
- Associates the file with the session
- Stores the client's current checksum for comparison
- Does NOT send immediate notification

### File Change Detection
- When chokidar reports a change:
  1. Read file content (or use fs.stat for mtime-only check)
  2. Compute MD5 checksum
  3. Compare with stored checksum
  4. If different, send "file_outdated" WebSocket event
  5. Update stored checksum to the new value

### Debouncing
- Debounce change events by 300ms to avoid rapid successive notifications
- Only send notification after debounce period with stable checksum

### Error Scenarios
- **File not found**: Send "file_deleted" event
- **Permission denied**: Log warning, stop watching this file
- **Watcher limit reached**: Log error, send "watcher_unavailable" event

## Dependencies
- chokidar (npm package)
- crypto (node built-in for MD5)

## Testing
- Unit test with mock chokidar
- Integration test with actual file system changes
