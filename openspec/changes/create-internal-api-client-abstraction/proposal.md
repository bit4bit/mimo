## Why

The current implementation has significant code duplication across all domain routes when calling the internal API. Each route repeats the same pattern:

```typescript
const token = extractTokenFromCookie(c);
if (!token) {
  return c.redirect("/auth/login");
}
const response = await fetch(`${platformUrl}/api/internal/...`, {
  headers: { Authorization: `Bearer ${token}` },
  ...
});
if (!response.ok) { ... }
const result = await response.json();
```

This pattern is repeated 100+ times across the codebase, making it:

- Error-prone (inconsistent error handling)
- Hard to maintain (change token extraction in 20 places)
- Verbose (obscures business logic)
- Difficult to test (each route mocks fetch differently)

MCP Servers already has a `proxyToInternalApi()` helper showing the value of abstraction.

## What Changes

Create a shared **Internal API Client** abstraction that provides:

1. **Simplified API calls**: `apiClient.get('/sessions')` instead of manual fetch
2. **Automatic token handling**: Extracts and forwards JWT automatically
3. **Consistent error handling**: Standardized error responses
4. **Type safety**: Generic response types
5. **Reduced boilerplate**: 5 lines → 1 line per API call

Before:

```typescript
const token = extractTokenFromCookie(c);
if (!token) return c.redirect("/auth/login");
const res = await fetch(`${platformUrl}/api/internal/sessions`, {
  headers: { Authorization: `Bearer ${token}` }
});
if (!res.ok) { return c.html(<ErrorPage />, res.status); }
const result = await res.json();
```

After:

```typescript
const apiClient = createInternalApiClient(c, mimoContext);
const result = await apiClient.get('/sessions');
if (!result.success) { return c.html(<ErrorPage />, result.code); }
```

## Capabilities

### New Capabilities

- `internal-api-client`: Shared abstraction for calling internal API from web routes

### Modified Capabilities

<!-- None - this is refactoring existing code -->

## Impact

- **All route files affected**: Update to use new client
- **No breaking changes**: Internal API endpoints unchanged
- **Reduced code**: ~50% reduction in route file sizes
- **Improved maintainability**: Single place to change token/auth logic
- **Better testing**: Mock the client, not fetch
