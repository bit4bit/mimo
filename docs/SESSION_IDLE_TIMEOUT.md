# Session Idle Timeout Configuration

## Overview

The MIMO platform supports per-session idle timeout configuration to automatically manage ACP (Agent Client Protocol) resources. When a session is inactive for the configured timeout period, the ACP process is automatically "parked" to free system resources. The session can be transparently resumed when the user sends a new message.

## Default Behavior

- **Default timeout:** 10 minutes (600000ms)
- **Minimum timeout:** 10 seconds (10000ms)
- **Disable parking:** Set to 0

## API Endpoints

### Update Session Idle Timeout

Updates the idle timeout configuration for a specific session.

```
PATCH /sessions/:id/config
```

**Headers:**
- `Content-Type: application/json`
- `Cookie: token=<jwt-token>` (or use authentication header)

**Request Body:**
```json
{
  "idleTimeoutMs": 120000
}
```

**Parameters:**
- `idleTimeoutMs` (number): Idle timeout in milliseconds
  - Minimum: 10000 (10 seconds)
  - Maximum: No maximum (use reasonable values)
  - 0: Disables automatic parking

**Response (200 OK):**
```json
{
  "success": true,
  "session": {
    "id": "session-uuid",
    "idleTimeoutMs": 120000,
    "acpStatus": "active"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid idleTimeoutMs (below minimum)
- `401 Unauthorized`: Not authenticated
- `404 Not Found`: Session not found or not owned by user

**Example:**
```bash
curl -X PATCH \
  https://mimo.example.com/sessions/abc-123/config \
  -H "Content-Type: application/json" \
  -H "Cookie: token=your-jwt-token" \
  -d '{"idleTimeoutMs": 300000}'
```

## Session States

Sessions can be in one of three ACP states:

### Active
- ACP process is running and ready
- User can send messages normally
- Status indicator shows "● Agent ready"

### Parked
- ACP process has been terminated to save resources
- Session context is cached (model, mode, session ID)
- Next message will trigger resumption
- Status indicator shows "💤 Agent sleeping"

### Waking
- ACP process is respawning
- Previous session context is being restored
- Input is temporarily disabled
- Status indicator shows "⏳ Waking agent..."

## WebSocket Events

The platform broadcasts ACP status changes via WebSocket to all connected clients:

```json
{
  "type": "acp_status",
  "sessionId": "session-uuid",
  "status": "active|parked|waking",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Session Reset Notification:**
```json
{
  "type": "acp_status",
  "sessionId": "session-uuid",
  "status": "active",
  "wasReset": true,
  "message": "Session expired - starting fresh",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Activity Tracking

The following events reset the idle timer:

1. **User messages** - When user sends a message via WebSocket
2. **ACP thought events** - `thought_start`, `thought_chunk`, `thought_end`
3. **ACP message chunks** - Response streaming from agent
4. **ACP usage updates** - Usage statistics from agent

## Best Practices

### Development Workflows

**Short sessions (under 30 minutes):**
```json
{ "idleTimeoutMs": 120000 }  // 2 minutes
```
Good for quick tasks where you don't want resources tied up between messages.

**Long sessions (multi-hour work):**
```json
{ "idleTimeoutMs": 1800000 }  // 30 minutes
```
Prevents interruptions during focused work periods.

**Always-available sessions:**
```json
{ "idleTimeoutMs": 0 }  // Disabled
```
For critical sessions where immediate response is always required. Note: This consumes resources continuously.

### Resource Management

- Monitor active sessions and their idle timeouts
- Consider shorter timeouts for shared/collaborative projects
- Longer timeouts for individual deep-work sessions
- Use 0 (disabled) sparingly - only when necessary

## Troubleshooting

### Session not parking

1. Check if `idleTimeoutMs` is set correctly:
   ```bash
   curl https://mimo.example.com/sessions/:id \
     -H "Cookie: token=your-token"
   ```

2. Verify no activity is occurring:
   - Check browser console for WebSocket messages
   - Look for unexpected `thought_chunk` or `message_chunk` events

3. Ensure agent is connected and processing

### Slow wake-up

- Expected: 1-2 seconds for ACP process spawn
- If longer: Check agent logs for initialization errors
- Verify `acpSessionId` is being cached correctly

### Session reset on resume

This occurs when the ACP provider no longer has the session cached:
- Normal behavior after extended idle periods
- Chat history is preserved
- Model and mode preferences are restored
- Only the LLM's conversation context is fresh
