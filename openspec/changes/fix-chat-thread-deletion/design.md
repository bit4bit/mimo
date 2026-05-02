## Overview

Add the missing DELETE endpoint for chat threads to the internal sessions API router. The web-facing route already exists and forwards to the internal API, but the internal route was never registered during the original chat threads implementation.

## Architecture

```
Web Route                     Internal API
─────────                     ───────────
DELETE                        DELETE
/sessions/:id                 /api/internal
/chat-threads/:threadId  ──▶  /sessions/:id
                              /chat-threads/:threadId

Existing: handler calls       Missing: no handler
apiClient.delete()            registered → 404
```

## Handler Implementation

The `deleteChatThreadHandler` will:
1. Extract `sessionId` and `threadId` from route parameters
2. Call `sessionsRepository.removeChatThread(sessionId, threadId)`
3. Return 200 with `{ success: true }` on success
4. Return 404 if session or thread not found

Note: There is no restriction on deleting the last thread. A session may have zero chat threads, just as it starts with zero threads.

## Route Registration

In `src/api/rest/sessions.ts`, add after the existing chat thread routes:
```typescript
router.delete("/:id/chat-threads/:threadId", deleteChatThreadHandler);
```

## Tests

- Test successful deletion returns 204
- Test deleting last thread returns 400
- Test non-existent session returns 404
- Test non-existent thread returns 404
