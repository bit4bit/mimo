## Context

Sessions routes (`src/sessions/routes.tsx`) have been partially refactored to the HTTP proxy pattern. GET `/sessions/:id` now uses HTTP fetch to the internal API, but ~57 direct service/repository calls remain across other routes.

Current state:
- ✅ GET `/sessions/:id` - Uses HTTP proxy (fetch to `/api/internal/sessions/:id/details` and `/chat`)
- ❌ All other routes - Still use direct service/repository calls

## Goals / Non-Goals

**Goals:**
- Complete HTTP proxy pattern for ALL Sessions routes
- Remove remaining 57+ direct service/repository calls
- Achieve 100% HTTP proxy pattern across all domains

**Non-Goals:**
- Changing internal API endpoints (already exist)
- Breaking existing functionality
- Refactoring other domains (already complete)

## Decisions

### 1. Endpoint Mapping for Remaining Routes

**POST `/sessions` (Create session):**
```typescript
const token = extractTokenFromCookie(c);
const response = await fetch(`${platformUrl}/api/internal/sessions`, {
  method: "POST",
  headers: { 
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(sessionData)
});
```

**DELETE `/sessions/:id` (Delete session):**
```typescript
const response = await fetch(
  `${platformUrl}/api/internal/sessions/${sessionId}`,
  {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  }
);
```

**PUT `/sessions/:id` (Update session):**
```typescript
const response = await fetch(
  `${platformUrl}/api/internal/sessions/${sessionId}`,
  {
    method: "PUT",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(updates)
  }
);
```

**GET `/sessions/:id/chat` (Chat history):**
```typescript
const response = await fetch(
  `${platformUrl}/api/internal/sessions/${sessionId}/chat`,
  {
    headers: { Authorization: `Bearer ${token}` }
  }
);
```

**POST `/sessions/:id/chat` (Save message):**
```typescript
const response = await fetch(
  `${platformUrl}/api/internal/sessions/${sessionId}/chat`,
  {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message })
  }
);
```

**Additional endpoints needed:**
- GET `/api/internal/mcp-servers` - Replace `mcpServerService.findAll()`
- GET `/api/internal/agents/:id` - Replace `agentRepository.findById()`
- GET `/api/internal/config` - Replace `configService.load()`

### 2. What to Keep in Routes Layer

Some calls should remain in routes (not business logic):

- **`sharedFossilServer.getUrl(sessionId)`** - Infrastructure/infrastructure
- **`sessionStateService.getModelState(sessionId)`** - Runtime state, not persisted
- **`sessionStateService.getModeState(sessionId)`** - Runtime state, not persisted
- **WebSocket handling** - Stays in routes layer
- **Agent connection checking** - Stays in routes layer
- **File watching** - Stays in routes layer

### 3. Complete List of Calls to Replace

From `grep` analysis:

```
162:    const mcpServers = await mcpServerService.findAll();
242:          const server = await mcpServerService.findById(id);
250:          await mcpServerService.findDuplicateNames(mcpServerIds);
263:    const session = await sessionRepository.create({
290:        await sessionRepository.delete(projectId, session.id);
309:          await sessionRepository.delete(projectId, session.id);
325:            await sessionRepository.delete(projectId, session.id);
345:        await sessionRepository.delete(projectId, session.id);
362:        await sessionRepository.update(session.id, { branch: desiredBranch });
383:        await sessionRepository.delete(projectId, session.id);
388:      await sessionRepository.update(session.id, {
405:        await sessionRepository.delete(projectId, session.id);
426:          mcpServers = await mcpServerService.resolveMcpServers(mcpServerIds);
437:      await sessionRepository.delete(projectId, session.id);
454:    const allSessions = await sessionRepository.listAll();
570:        agent = await agentRepository.findById(session.assignedAgentId);
575:      const fullSession = await sessionRepository.findById(sessionId);
648:    const session = await sessionRepository.findById(sessionId);
664:    const session = await sessionRepository.findById(sessionId);
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Sessions routes are complex (2000+ lines) | Refactor incrementally, route by route |
| Runtime state (model/mode) mixed with persisted data | Keep runtime calls, only replace persisted data calls |
| Breaking session functionality | Comprehensive testing after each route |
| Internal API missing some endpoints | Verify endpoints exist before refactoring |

## Migration Plan

### Phase 1: Create Session
1. Replace POST `/sessions` direct calls with HTTP fetch
2. Test session creation

### Phase 2: Delete Session
1. Replace DELETE operations with HTTP fetch
2. Test session deletion

### Phase 3: Update Session
1. Replace UPDATE operations with HTTP fetch
2. Test session updates

### Phase 4: Chat Operations
1. Complete GET `/sessions/:id/chat` HTTP proxy
2. Add POST `/sessions/:id/chat` HTTP proxy
3. Test chat functionality

### Phase 5: Auxiliary Calls
1. Add GET `/api/internal/mcp-servers` call
2. Add GET `/api/internal/agents/:id` call
3. Add GET `/api/internal/config` call
4. Verify remaining direct calls are infrastructure/runtime only

### Phase 6: Testing
1. Update all Sessions route tests
2. Run full test suite
3. Manual testing of all session workflows

## Open Questions

1. Should we add a `proxyToInternalApi()` helper to Sessions like MCP Servers uses?
2. Do all internal API endpoints already exist for these operations?
3. Should we add endpoints for MCP servers list and agent lookup if not present?
