# Spec: WebSocket Events for File Watching

## Responsibility
Define the WebSocket message protocol between client and server for file watching functionality.

## Message Schema

### Client to Server

#### watch_file
Sent when client opens a file in EditBuffer.

```typescript
{
  type: "watch_file";
  sessionId: string;
  path: string;        // Relative path from workspace
  checksum: string;    // MD5 of current content
}
```

#### unwatch_file
Sent when client closes a file in EditBuffer.

```typescript
{
  type: "unwatch_file";
  sessionId: string;
  path: string;
}
```

### Server to Client

#### file_outdated
Sent when watched file changes on disk.

```typescript
{
  type: "file_outdated";
  path: string;
  timestamp: string;   // ISO 8601
}
```

#### file_changed
Sent after debouncing to confirm final state.

```typescript
{
  type: "file_changed";
  path: string;
  checksum: string;    // New checksum
  timestamp: string;
}
```

#### file_deleted
Sent when watched file is deleted.

```typescript
{
  type: "file_deleted";
  path: string;
}
```

## WebSocket Route

Add to existing session WebSocket or create new route:

```typescript
// GET /ws/sessions/:id/files
// WebSocket endpoint for file watching events

// Authentication: Same as existing session routes (cookie/JWT)
```

## Implementation Notes
- Reuse existing WebSocket infrastructure if available
- Ensure messages are session-scoped (client only receives events for their session)
- Handle client disconnections gracefully (unwatch all on disconnect)
