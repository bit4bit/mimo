## Why

Upon detailed review of the codebase:

- **7 domains fully complete**: Dashboard, Credentials, Projects, Agents, Config, Auth use HTTP `fetch()` to `/api/internal/*`
- **2 domains complete with helper**: MCP Servers and Summary use `proxyToInternalApi()` helper (HTTP-based)
- **1 domain NOT DONE**: Sessions still has **59 direct `sessionRepository` calls** despite importing `extractTokenFromCookie`

The Sessions routes were marked complete in tasks but the actual implementation shows they still call services/repositories directly. This is the only remaining domain that needs to be refactored to use the HTTP proxy pattern.

## What Changes

### Complete Sessions Routes Refactor to HTTP Proxy Pattern

**Current State (WRONG):**
```typescript
// Sessions routes currently call services directly:
const session = await sessionRepository.create({...});
await sessionRepository.update(session.id, {...});
await chatService.loadHistory(sessionId, threadId);
```

**Target State (CORRECT):**
```typescript
// Sessions routes should use HTTP fetch:
const token = extractTokenFromCookie(c);
const response = await fetch(`${platformUrl}/api/internal/sessions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify(sessionData)
});
const result = await response.json();
```

### Specific Changes Needed

1. **Remove direct service injections** from Sessions routes:
   - Remove `sessionRepository` usage (59 calls)
   - Remove `chatService` usage
   - Remove `agentService` usage (keep only for WebSocket)

2. **Add HTTP fetch calls** to:
   - `GET /api/internal/sessions` - list sessions
   - `POST /api/internal/sessions` - create session
   - `GET /api/internal/sessions/:id` - get session
   - `PUT /api/internal/sessions/:id` - update session
   - `DELETE /api/internal/sessions/:id` - delete session
   - `GET /api/internal/sessions/:id/chat` - chat history
   - `POST /api/internal/sessions/:id/chat` - save message
   - `POST /api/internal/sessions/:id/assign-agent` - assign agent

3. **Keep WebSocket handling** in routes layer (not in internal API)

## Capabilities

### New Capabilities
- `sessions-proxy-pattern-completion`: Complete the HTTP proxy pattern implementation for Sessions routes

### Modified Capabilities
<!-- None - this completes existing implementation -->

## Impact

- **Only domain affected**: Sessions
- **Routes affected**: `/sessions/*` (all session-related routes)
- **No breaking changes**: Internal API endpoints already exist
- **Test impact**: Sessions route tests need to mock HTTP calls instead of repository calls
- **Architecture**: After this change, ALL domains will use HTTP proxy pattern consistently
