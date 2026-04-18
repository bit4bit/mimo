# Spec: EditBuffer State Extension

## Responsibility
Extend the client-side EditBufferState to track file checksums and outdated status.

## State Changes

### OpenFile Interface Extension

```javascript
// In public/js/edit-buffer.js

// Add to file object when opening:
{
  path: string;
  name: string;
  language: string;
  lineCount: number;
  content: string;
  scrollPosition: number;
  // NEW:
  contentChecksum: string;  // MD5 hash
  isOutdated: boolean;      // Flag for outdated indicator
}
```

## New Methods

### computeChecksum(content)
```javascript
function computeChecksum(content) {
  // Simple hash function for browser environment
  // Note: Use SubtleCrypto if available, fallback for older browsers
}
```

### markOutdated(path)
```javascript
function markOutdated(path) {
  const file = openFiles.find(f => f.path === path);
  if (file) {
    file.isOutdated = true;
    renderEditBuffer();
  }
}
```

### clearOutdated(path)
```javascript
function clearOutdated(path) {
  const file = openFiles.find(f => f.path === path);
  if (file) {
    file.isOutdated = false;
  }
}
```

### reloadFile(path, sessionId)
```javascript
function reloadFile(path, sessionId, callback) {
  // 1. Save scroll position
  // 2. Fetch new content from server
  // 3. Update content and checksum
  // 4. Clear outdated flag
  // 5. Re-render
  // 6. Restore scroll position
}
```

## WebSocket Integration

```javascript
// Add to init() function:
function initWebSocket() {
  const ws = new WebSocket(`/ws/sessions/${sessionId}/files`);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'file_outdated') {
      markOutdated(data.path);
    } else if (data.type === 'file_deleted') {
      markOutdated(data.path); // Show as outdated/deleted
    }
  };
  
  // Store ws reference for sending watch/unwatch messages
  window.EditBuffer.ws = ws;
}
```

## Watch/Unwatch Integration

```javascript
// In fetchAndAddFile - after loading file:
function notifyWatchFile(sessionId, file) {
  if (window.EditBuffer.ws && window.EditBuffer.ws.readyState === WebSocket.OPEN) {
    window.EditBuffer.ws.send(JSON.stringify({
      type: 'watch_file',
      sessionId: sessionId,
      path: file.path,
      checksum: file.contentChecksum
    }));
  }
}

// In remove - before removing file:
function notifyUnwatchFile(sessionId, path) {
  if (window.EditBuffer.ws && window.EditBuffer.ws.readyState === WebSocket.OPEN) {
    window.EditBuffer.ws.send(JSON.stringify({
      type: 'unwatch_file',
      sessionId: sessionId,
      path: path
    }));
  }
}
```

## Persistence

- `contentChecksum` should be persisted to localStorage alongside other file data
- `isOutdated` should NOT be persisted (always false on page load, re-detected)
