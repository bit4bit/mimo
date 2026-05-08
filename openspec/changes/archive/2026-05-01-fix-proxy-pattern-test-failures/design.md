## Context

After the proxy pattern refactor, 116 tests are failing:

1. **Auth routes (5 failures)**: JSON parsing errors
2. **Sessions routes (31 failures)**: 404 responses
3. **Projects routes (15 failures)**: 404 responses
4. **Other domains**: Various errors

## Goals / Non-Goals

**Goals:**

- Fix JSON parsing errors in auth routes
- Debug and fix 404 errors in sessions/projects
- Improve error handling consistency
- Get all tests passing

**Non-Goals:**

- Changing internal API endpoints structure
- Breaking existing functionality
- Major refactors

## Decisions

### 1. Auth Routes Fix

The issue is at line 48 in `auth/routes.tsx`:

```typescript
// Current (fails):
const result = await response.json() as { data: RegisterResponse };

// Fixed:
const result = await response.json().catch(() => ({
  error: "Invalid response from server"
})) as { data?: RegisterResponse; error?: string };

if (result.error || !result.data) {
  return c.html(<RegisterPage error={result.error || "Registration failed"} />, 500);
}
```

### 2. 404 Error Investigation

Steps to debug:

1. Check if internal API endpoints exist:

   ```typescript
   // Should exist:
   GET /api/internal/sessions
   POST /api/internal/sessions
   GET /api/internal/sessions/:id
   PUT /api/internal/sessions/:id
   DELETE /api/internal/sessions/:id
   GET /api/internal/sessions/:id/chat
   ```

2. Verify routes are calling correct paths:

   ```typescript
   // Check for path mismatches
   // e.g., /sessions vs /sessions/:id
   ```

3. Check internal API handlers return proper responses

### 3. Error Handling Pattern

Standardize all routes with this pattern:

```typescript
async function callInternalApi<T>(
  c: Context,
  mimoContext: MimoContext,
  path: string,
  options?: RequestInit,
): Promise<
  { success: true; data: T } | { success: false; error: string; status: number }
> {
  try {
    const token = extractTokenFromCookie(c);
    if (!token) {
      return { success: false, error: "Unauthorized", status: 401 };
    }

    const platformUrl = mimoContext.env.PLATFORM_URL;
    const response = await fetch(`${platformUrl}/api/internal${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(options?.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({
      error: "Invalid JSON response",
    }));

    if (!response.ok || data.error) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
        status: response.status,
      };
    }

    return { success: true, data: data.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
      status: 500,
    };
  }
}
```

## Migration Plan

1. Fix auth routes JSON parsing
2. Debug sessions 404 errors
3. Debug projects 404 errors
4. Run tests to verify fixes
5. Address any remaining failures

## Risks

- Could mask other issues with generic error handling
- Need to ensure all errors are properly propagated to users
