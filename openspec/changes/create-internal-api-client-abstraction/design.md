## Context

Current state: Every route repeats the same boilerplate when calling internal API:

```typescript
// Dashboard routes (repeated 1 time)
const token = extractTokenFromCookie(c);
if (!token) { return c.redirect("/auth/login"); }
const response = await fetch(`${platformUrl}/api/internal/dashboard`, {
  headers: { Authorization: `Bearer ${token}` },
});
const result = await response.json() as { data: DashboardResponse };

// Projects routes (repeated 9 times)
const token = extractTokenFromCookie(c);
if (!token) { return c.redirect("/auth/login"); }
const response = await fetch(`${platformUrl}/api/internal/projects`, ...);

// Sessions routes (repeated 12 times)
const token = extractTokenFromCookie(c);
if (!token) { return c.redirect("/auth/login"); }
const response = await fetch(`${platformUrl}/api/internal/sessions`, ...);

// ... repeated in all domains
```

MCP Servers already has `proxyToInternalApi()` showing a better pattern exists.

## Goals / Non-Goals

**Goals:**
- Create shared InternalApiClient abstraction
- Reduce route file boilerplate by ~70%
- Standardize error handling across all routes
- Make routes focus on business logic, not HTTP plumbing

**Non-Goals:**
- Changing internal API endpoints
- Changing service implementations
- Breaking existing functionality

## Decisions

### 1. API Design

```typescript
// Factory function that creates client bound to context
function createInternalApiClient(c: Context, mimoContext: MimoContext) {
  return {
    // HTTP methods with automatic token handling
    get<T>(path: string): Promise<ApiResult<T>>;
    post<T>(path: string, body: unknown): Promise<ApiResult<T>>;
    put<T>(path: string, body: unknown): Promise<ApiResult<T>>;
    delete<T>(path: string): Promise<ApiResult<T>>;
  };
}

type ApiResult<T> = 
  | { success: true; data: T; status: number }
  | { success: false; error: string; status: number };
```

### 2. Usage Pattern

```typescript
// Before: ~10 lines
const token = extractTokenFromCookie(c);
if (!token) { return c.redirect("/auth/login"); }
const response = await fetch(`${platformUrl}/api/internal/sessions`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) {
  const error = await response.text();
  return c.html(<ErrorPage error={error} />, response.status);
}
const result = await response.json() as { data: SessionResponse };

// After: ~3 lines
const apiClient = createInternalApiClient(c, mimoContext);
const result = await apiClient.get<SessionResponse>('/sessions');
if (!result.success) { return c.html(<ErrorPage error={result.error} />, result.status); }
```

### 3. File Location

```
src/api/internal/shared/
├── auth.ts               # Existing
├── response.ts           # Existing
├── token.ts              # Existing
└── client.ts             # NEW: InternalApiClient
```

### 4. Implementation Details

```typescript
// src/api/internal/shared/client.ts
export function createInternalApiClient(c: Context, mimoContext: MimoContext) {
  const platformUrl = mimoContext.env.PLATFORM_URL;
  
  async function request<T>(
    method: string, 
    path: string, 
    body?: unknown
  ): Promise<ApiResult<T>> {
    const token = extractTokenFromCookie(c);
    if (!token) {
      return { 
        success: false, 
        error: "Unauthorized", 
        status: 401 
      };
    }

    const headers: Record<string, string> = {
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(`${platformUrl}/api/internal${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
          status: response.status,
        };
      }

      return {
        success: true,
        data: data.data,
        status: response.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
        status: 500,
      };
    }
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
    put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
    delete: <T>(path: string) => request<T>("DELETE", path),
  };
}
```

### 5. Migration Strategy

Phase 1: Create client
- Implement `createInternalApiClient()`
- Add comprehensive tests

Phase 2: Update routes incrementally
- Dashboard (simplest, test pattern)
- Credentials (simple CRUD)
- Projects (medium complexity)
- Sessions (most complex)
- All remaining domains

Phase 3: Remove old code
- Remove `extractTokenFromCookie` imports from routes (keep in client)
- Remove manual fetch boilerplate
- Keep MCP Servers `proxyToInternalApi()` (compatible)

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaking existing routes | Incremental migration, test each domain |
| Different error handling | Maintain same error response format |
| Loss of flexibility | Keep manual fetch option for edge cases |

## Migration Plan

1. Create client.ts with full implementation
2. Write unit tests for client
3. Update Dashboard routes (simplest)
4. Update remaining domains one by one
5. Verify all tests pass
6. Remove unused imports from routes

## Open Questions

1. Should we add request/response interceptors for logging?
2. Should we support custom headers for edge cases?
3. Should we keep `proxyToInternalApi()` in MCP Servers or migrate it?
