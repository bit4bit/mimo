# Design: EditBuffer Outdated File Detection

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  EditBuffer Component                      │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │   │
│  │  │   Tabs Bar  │  │ Context Bar  │  │ Content View   │  │   │
│  │  │             │  │ [Outdated]   │  │                │  │   │
│  │  │             │  │ [Reload Btn] │  │                │  │   │
│  │  └─────────────┘  └──────────────┘  └────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              edit-buffer.js (State Manager)              │   │
│  │  - Tracks open files and their loaded content checksum   │   │
│  │  - Listens for file change events via WebSocket          │   │
│  │  - Manages "outdated" state per file                     │   │
│  │  - Handles reload action (keybinding + button)         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                           │ WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Server (mimo-platform)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              File Watcher Service (chokidar)             │   │
│  │  - Watches files currently open in EditBuffer            │   │
│  │  - Computes content checksums on change                │   │
│  │  - Emits events to WebSocket manager                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              WebSocket Notification Manager              │   │
│  │  - Session-scoped WebSocket for file events              │   │
│  │  - Sends {type: 'file_changed', path, checksum}          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. File Open Flow
1. User opens file via file finder
2. Client fetches file content from `/sessions/:id/files/content`
3. Client stores file path, content, and computes checksum in EditBufferState
4. Client sends "watch_file" message to server WebSocket
5. Server adds file path to chokidar watcher for that session

### 2. File Change Detection Flow
1. chokidar detects file change on disk
2. Server reads file and computes checksum
3. Server compares with last known checksum from client
4. If different, server sends "file_outdated" event via WebSocket
5. Client receives event, marks file as outdated in EditBufferState
6. Client re-renders to show outdated indicator and reload button

### 3. File Reload Flow
1. User clicks reload button or presses Alt+Shift+R
2. Client saves current scroll position
3. Client fetches fresh content from `/sessions/:id/files/content`
4. Client updates file content and checksum in EditBufferState
5. Client clears outdated flag
6. Client re-renders content and restores scroll position

## State Changes

### EditBufferState Extension
```typescript
interface OpenFile {
  path: string;
  name: string;
  language: string;
  lineCount: number;
  content: string;
  scrollPosition: number;
  // NEW FIELDS:
  contentChecksum: string;     // MD5 hash of content
  isOutdated: boolean;         // True if disk version differs
  lastModified: number;        // Last known mtime
}
```

## UI Changes

### Context Bar Modifications
The context bar (id="edit-buffer-context") will show:
- Current file path
- Line count
- Language
- **NEW: Outdated indicator** (when isOutdated=true)
  - Visual indicator (e.g., orange/yellow dot or "Outdated" label)
  - Reload button with "Reload (Alt+Shift+R)" tooltip

### Keybinding Addition
Add to DEFAULT_KEYBINDINGS in session-keybindings.js:
```javascript
reloadFile: "Alt+Shift+R"
```

## Server-Side Components

### FileWatcherService
```typescript
interface FileWatcherService {
  watchFile(sessionId: string, filePath: string): void;
  unwatchFile(sessionId: string, filePath: string): void;
  unwatchAll(sessionId: string): void;
  getChecksum(filePath: string): Promise<string>;
}
```

### WebSocket Event Schema
```typescript
// Client -> Server
interface WatchFileMessage {
  type: 'watch_file';
  path: string;
  checksum: string;
}

interface UnwatchFileMessage {
  type: 'unwatch_file';
  path: string;
}

// Server -> Client
interface FileOutdatedEvent {
  type: 'file_outdated';
  path: string;
}

interface FileChangedEvent {
  type: 'file_changed';
  path: string;
  checksum: string;
}
```

## Error Handling
- File deleted externally: Mark as outdated, show "File deleted" indicator
- Permission denied: Log error, skip watching
- Watcher errors: Log and degrade gracefully (no notifications)

## Performance Considerations
- Only watch files currently open in EditBuffer
- Use chokidar's native fsevents on macOS for efficiency
- Debounce rapid successive changes (300ms)
- Compute checksums asynchronously to avoid blocking
