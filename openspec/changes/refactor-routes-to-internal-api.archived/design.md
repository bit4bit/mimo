## Context

Currently, mimo-platform has a monolithic architecture where route handlers directly call services and repositories. This creates tight coupling between the web presentation layer and business logic, making it difficult to:

1. Support multiple frontends (web UI, CLI, mobile, etc.)
2. Test business logic independently of HTTP handlers
3. Evolve the API separately from the UI

The codebase uses Hono framework with JSX for server-side rendering. Services are organized by domain (projects, sessions, agents, etc.) and injected via MimoContext.

## Goals / Non-Goals

**Goals:**
- Decouple web layer from business logic via an internal REST API
- Enable future multi-frontend support without duplicating business logic
- Standardize API response formats across all domains
- Maintain existing route behavior (no breaking changes)
- Reuse existing JWT authentication between layers

**Non-Goals:**
- Extracting services into separate processes or microservices (stays same process)
- Changing service implementations
- Modifying API-only routes (files, commits, sync, auto-commit)
- Adding new features or capabilities
- Changing the database schema

## Decisions

### 1. Same-Process Internal API
**Decision**: Run internal API in the same process as the web layer.

**Rationale**: 
- Simplifies deployment (single binary)
- No network overhead for internal communication
- Can use direct function calls if needed while maintaining HTTP abstraction
- Can be extracted later if needed

**Alternative considered**: Separate process API - rejected due to unnecessary complexity for current needs.

### 2. HTTP-Based Proxy Communication
**Decision**: Web routes make HTTP requests to internal API, not direct function calls.

**Rationale**:
- Clear boundary between layers
- Forces proper request/response abstraction
- Easier to test (can mock HTTP calls)
- Future-ready for potential extraction
- Consistent with how external APIs would be called

**Alternative considered**: Direct service injection - rejected as it doesn't achieve decoupling goal.

### 3. JWT Token Forwarding
**Decision**: Web layer forwards JWT tokens to internal API via Authorization header.

**Rationale**:
- Reuses existing auth infrastructure
- Internal API remains independently securable
- No additional auth mechanism needed
- Tokens validated at both layers (defense in depth)

**Implementation**:
- Web routes extract token from cookie/header
- Token forwarded as `Authorization: Bearer <token>`
- Internal API middleware validates token using same JwtService

### 4. Domain-Based File Organization
**Decision**: Organize internal API by domain under `src/api/internal/{domain}/`.

**Rationale**:
- Matches existing service organization
- Easier to navigate and maintain
- Can be independently tested per domain
- Clear separation of concerns

**Structure**:
```
src/api/internal/
├── projects/
│   ├── handlers.ts    # GET, POST, PUT, DELETE handlers
│   ├── routes.ts      # Router configuration
│   └── types.ts       # Request/response types
├── sessions/
│   ├── handlers.ts
│   ├── routes.ts
│   └── types.ts
└── ...
```

### 5. Standardized Response Format
**Decision**: Use consistent JSON structure: `{ success: boolean, data?: any, error?: string }`

**Rationale**:
- Predictable client-side handling
- Easy to wrap service responses
- Clear error communication

### 6. Service Reuse
**Decision**: Internal API handlers call existing services directly.

**Rationale**:
- No service code changes needed
- Services already have proper business logic
- DRY principle - don't duplicate logic
- Can refactor services later without affecting routes

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Performance overhead of HTTP loopback | Use efficient HTTP client, consider Unix sockets if needed, benchmark before optimization |
| Complexity of maintaining two layers | Clear separation of concerns, domain-based organization, comprehensive tests |
| Duplicated validation (routes + API) | Routes do minimal validation (presence checks), API does full validation |
| Auth token handling complexity | Standardize token extraction, use middleware consistently |
| Breaking existing functionality | Comprehensive test coverage, gradual rollout by domain |
| WebSocket handling | Keep WebSocket handling in routes layer, only REST endpoints in internal API |

## Migration Plan

### Phase 1: Infrastructure
1. Create `src/api/internal/` directory structure
2. Create base router with auth middleware
3. Create standardized response utilities
4. Add internal API mounting in main app

### Phase 2: Domains (one at a time)
For each domain in order: projects, sessions, agents, dashboard, credentials, config, mcp-servers, summary, auth

1. Create internal API handlers for the domain
2. Create internal API routes
3. Refactor web routes to proxy to internal API
4. Update tests for the domain
5. Verify all endpoints work correctly

### Phase 3: Cleanup
1. Remove unused direct service imports from routes
2. Document the architecture
3. Add architecture decision record (ADR)

### Rollback Strategy
Since this is same-process, rollback involves:
1. Reverting route files to use direct service calls
2. Disabling internal API router
3. No database changes needed

## Open Questions

1. Should we cache internal API responses in the proxy layer for performance?
2. How should we handle streaming responses (for chat)?
3. Should internal API have its own rate limiting separate from web layer?
4. Do we need request/response logging for the internal API?

These can be decided during implementation based on observed needs.
