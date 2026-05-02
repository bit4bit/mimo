## Context

We need base infrastructure before any domain can be refactored. The internal API needs to be mounted, authenticated, and have standardized responses.

## Goals / Non-Goals

**Goals:**
- Create mountable internal API router at `/api/internal/*`
- Implement JWT forwarding from web layer to internal API
- Create standardized response utilities
- Set up dependency injection for services

**Non-Goals:**
- Domain-specific endpoints (those come later)
- WebSocket handling (stays in routes layer)
- Service changes

## Decisions

### 1. Response Utilities
Simple functions for consistent JSON:
```typescript
export function successResponse(data: any) {
  return { success: true, data };
}

export function errorResponse(message: string, code: number) {
  return { success: false, error: message, code };
}
```

### 2. Auth Middleware
Extracts Bearer token from Authorization header and validates using JwtService from MimoContext.

### 3. Router Factory
Function that accepts MimoContext and returns configured Hono router.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Auth validation duplicated | Keep validation logic in one place (shared auth middleware) |
| Response format inconsistency | Use utility functions, enforce via code review |

## Migration Plan

1. Create directory structure
2. Create shared utilities
3. Create main router with auth middleware
4. Mount in main app
5. Test with simple ping endpoint
