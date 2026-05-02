## Why

After implementing the HTTP proxy pattern refactor, tests are failing with two main issues:

1. **Auth routes JSON parsing error**: When internal API returns 500 error, the response body isn't valid JSON, causing `SyntaxError: Failed to parse JSON`
   - Location: `auth/routes.tsx:48`
   - Missing `.catch()` on success path JSON parsing

2. **Sessions/Projects 404 errors**: Routes calling internal API return 404, suggesting:
   - Path mismatches between route calls and internal API endpoints
   - Data not being returned correctly from internal API
   - Missing endpoints for certain operations

3. **General error handling**: Some routes don't properly handle network errors or non-JSON responses

These failures prevent the proxy pattern from working correctly and need to be fixed before the refactor is complete.

## What Changes

### Fix 1: Auth Routes Error Handling

Add JSON parse error handling to auth routes success paths:

```typescript
// Before (fails on non-JSON response):
const result = await response.json() as { data: RegisterResponse };

// After (handles non-JSON gracefully):
const result = await response.json().catch(() => ({ 
  error: "Invalid response from server" 
})) as { data?: RegisterResponse; error?: string };
```

### Fix 2: Debug and Fix 404 Errors

Investigate why sessions/projects return 404:
- Verify internal API endpoints exist and are mounted correctly
- Check request paths match between routes and internal API
- Ensure internal API handlers return proper responses
- Add missing endpoints if needed

### Fix 3: Improve Error Handling

Add consistent error handling across all routes:
- Network error handling (try/catch around fetch)
- Non-JSON response handling (.catch() on .json())
- Proper error messages to users

## Capabilities

### New Capabilities
- `proxy-pattern-test-fixes`: Fix test failures caused by proxy pattern implementation

### Modified Capabilities
<!-- Fixes existing implementation -->

## Impact

- **Files affected**: `src/auth/routes.tsx`, `src/sessions/routes.tsx`, `src/projects/routes.tsx`
- **Test impact**: Should fix 116 failing tests (31 sessions, 15 projects, 5 auth, etc.)
- **No breaking changes**: Only fixes error handling and endpoint matching
- **User impact**: Better error messages when things go wrong
