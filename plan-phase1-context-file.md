# Phase 1: Modify Core Context File

## Objective
Remove automatic `DummySharedFossilServer` instantiation from `mimo-context.ts` and default `sharedFossil` to `null`.

## File to Modify
`packages/mimo-platform/src/context/mimo-context.ts`

## Changes Required

### Step 1.1: Update Import (Line 25)
**Remove** `DummySharedFossilServer` from the import.

**Current:**
```typescript
import { SharedFossilServer, DummySharedFossilServer } from "../vcs/shared-fossil-server.js";
```

**Change to:**
```typescript
import { SharedFossilServer } from "../vcs/shared-fossil-server.js";
```

### Step 1.2: Replace Auto-Instantiation Logic (Lines 193-201)

**Current code:**
```typescript
// Create shared fossil server using factory function
// Only create if port is provided in env, or if explicitly overridden
// Use DummySharedFossilServer when port not provided (for tests)
const sharedFossilServer =
  overrides.services && "sharedFossil" in overrides.services
    ? overrides.services.sharedFossil!
    : env.MIMO_SHARED_FOSSIL_SERVER_PORT !== undefined
      ? createSharedFossilServer(env)
      : new DummySharedFossilServer();
```

**Replace with:**
```typescript
// sharedFossil must be explicitly injected - no auto-instantiation
const sharedFossilServer =
  overrides.services && "sharedFossil" in overrides.services
    ? overrides.services.sharedFossil!
    : null;
```

## Verification
1. TypeScript compilation should pass
2. `mimo-context.ts` no longer imports or instantiates `DummySharedFossilServer`
3. `sharedFossil` defaults to `null` when not provided via override

## Expected Outcome
The context factory no longer creates fossil server instances internally. Dependencies must be explicitly injected by the caller.
