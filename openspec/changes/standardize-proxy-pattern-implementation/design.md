## Context

After detailed review of the codebase, the proxy pattern implementation is actually **85% complete**:

- **7 domains fully complete**: Dashboard, Credentials, Projects, Agents, Config, Auth use direct HTTP `fetch()`
- **2 domains complete with helper**: MCP Servers and Summary use `proxyToInternalApi()` helper (HTTP-based)
- **1 domain partially done**: Sessions has `extractTokenFromCookie` imported but still makes **59 direct repository calls**

This change focuses on completing the Sessions routes to use the HTTP proxy pattern.

## Goals / Non-Goals

**Goals:**

- Refactor Sessions routes to use HTTP `fetch()` to internal API
- Remove all 59 direct `sessionRepository` calls from Sessions routes
- Remove direct `chatService` and `agentService` calls from Sessions routes
- Achieve 100% HTTP proxy pattern across all domains

**Non-Goals:**

- Changing MCP Servers or Summary (they use helper pattern which is correct)
- Changing any other domain (already complete)
- Changing internal API endpoints
- Breaking existing functionality

## Decisions

### 1. Sessions Endpoint Mapping

Current direct calls will be replaced with HTTP fetch to:

- `GET /api/internal/sessions` → list sessions
- `GET /api/internal/sessions/:id` → get session
- `POST /api/internal/sessions` → create session
- `PUT /api/internal/sessions/:id` → update session
- `DELETE /api/internal/sessions/:id` → delete session
- `GET /api/internal/sessions/:id/chat` → get chat history
- `POST /api/internal/sessions/:id/assign-agent` → assign agent

### 2. Pattern to Follow (copy from Dashboard)

```typescript
// Extract token
const token = extractTokenFromCookie(c);
if (!token) {
  return c.redirect("/auth/login");
}

// Call internal API
const platformUrl = mimoContext.env.PLATFORM_URL;
const response = await fetch(`${platformUrl}/api/internal/sessions/${sessionId}`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// Handle response
if (!response.ok) {
  const error = await response.text();
  return c.html(<ErrorPage error={error} />, response.status);
}

const result = await response.json();
if (!result.success) {
  return c.html(<ErrorPage error={result.error} />, result.code || 500);
}

// Render with API data
return c.html(<SessionPage session={result.data} />);
```

### 3. Specific Refactoring Tasks

Sessions routes has ~59 direct repository calls that need to be replaced:

1. **Session CRUD operations** (~20 calls):
   - `sessionRepository.create()` → `POST /api/internal/sessions`
   - `sessionRepository.findById()` → `GET /api/internal/sessions/:id`
   - `sessionRepository.update()` → `PUT /api/internal/sessions/:id`
   - `sessionRepository.delete()` → `DELETE /api/internal/sessions/:id`
   - `sessionRepository.listByProject()` → `GET /api/internal/sessions?projectId=...`

2. **Chat operations** (~10 calls):
   - `chatService.loadHistory()` → `GET /api/internal/sessions/:id/chat`
   - `chatService.saveMessage()` → `POST /api/internal/sessions/:id/chat`

3. **Agent operations** (~5 calls):
   - `agentService.assignAgent()` → `POST /api/internal/sessions/:id/assign-agent`
   - `agentService.requestCapabilities()` → `POST /api/internal/agents/:id/capabilities/refresh`

4. **Repository utility calls** (~24 calls):
   - `sessionRepository.getFossilPath()` → Internal API response should include this
   - May need to add fields to internal API response

## Risks / Trade-offs

| Risk                                    | Mitigation                                            |
| --------------------------------------- | ----------------------------------------------------- |
| Session routes are complex (large file) | Refactor incrementally, one route at a time           |
| 59 calls to replace                     | Start with CRUD operations, then chat, then utilities |
| Internal API may lack some fields       | Add needed fields to internal API response            |
| Breaking session functionality          | Comprehensive testing after each batch                |

## Migration Plan

### Phase 1: Session CRUD Operations

1. Replace `sessionRepository.create()` with HTTP POST
2. Replace `sessionRepository.findById()` with HTTP GET
3. Replace `sessionRepository.update()` with HTTP PUT
4. Replace `sessionRepository.delete()` with HTTP DELETE
5. Replace `sessionRepository.listByProject()` with HTTP GET + query param

### Phase 2: Chat Operations

1. Replace `chatService.loadHistory()` with HTTP GET to `/chat`
2. Replace `chatService.saveMessage()` with HTTP POST to `/chat`

### Phase 3: Agent Operations

1. Replace agent assignment with HTTP POST to `/assign-agent`
2. Replace capability refresh with HTTP POST to `/agents/:id/capabilities/refresh`

### Phase 4: Utility Functions

1. Add any missing fields to internal API responses
2. Replace `sessionRepository.getFossilPath()` and similar utilities
3. Update tests to mock HTTP calls

### Phase 5: Cleanup

1. Verify no direct service/repository calls remain in sessions routes
2. Run full test suite
3. Manual testing of session workflows

## Open Questions

1. Should we add a shared `makeInternalApiRequest()` helper to reduce duplication?
2. Do internal API responses already include all needed fields (like fossilPath)?
3. Should we refactor incrementally or all at once?
