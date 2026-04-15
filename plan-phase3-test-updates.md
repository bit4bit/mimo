# Phase 3: Update Tests Requiring DummySharedFossilServer

## Objective
Update tests that use `createSessionsRoutes` to explicitly inject `DummySharedFossilServer`.

## Files to Modify

### File 1: `test/shared-fossil-server.test.ts`

#### Step 3.1.1: Add Import (Line 6)

**Current:**
```typescript
import {
  SharedFossilServer,
  normalizeSessionIdForFossil,
} from "../src/vcs/shared-fossil-server.js";
```

**Change to:**
```typescript
import {
  SharedFossilServer,
  DummySharedFossilServer,
  normalizeSessionIdForFossil,
} from "../src/vcs/shared-fossil-server.js";
```

#### Step 3.1.2: Update Services Override (Lines 30-32)

**Current:**
```typescript
services: {
  sharedFossil: null as any, // Skip creating - test creates its own
},
```

**Change to:**
```typescript
services: {
  sharedFossil: new DummySharedFossilServer(),
},
```

### File 2: `test/frame-buffers.test.ts`

#### Step 3.2.1: Add Import (After line 6)

**Add:**
```typescript
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";
```

#### Step 3.2.2: Update createMimoContext Call (Lines 24-26)

**Current:**
```typescript
const ctx = createMimoContext({
  env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
});
```

**Change to:**
```typescript
const ctx = createMimoContext({
  env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
  services: {
    sharedFossil: new DummySharedFossilServer(),
  },
});
```

### File 3: `test/sessions.test.ts`

#### Step 3.3.1: Add Import (After line 5)

**Add:**
```typescript
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";
```

#### Step 3.3.2: Update createMimoContext Call (Lines 28-30)

**Current:**
```typescript
const ctx = createMimoContext({
  env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
});
```

**Change to:**
```typescript
const ctx = createMimoContext({
  env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
  services: {
    sharedFossil: new DummySharedFossilServer(),
  },
});
```

### File 4: `test/sessions-context.test.ts`

#### Step 3.4.1: Add Import (After existing imports)

**Add:**
```typescript
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";
```

#### Step 3.4.2: Update createMimoContext Call (Lines 23-24)

**Current:**
```typescript
const mimoContext = createMimoContext({ env: { MIMO_HOME: testHome } });
```

**Change to:**
```typescript
const mimoContext = createMimoContext({
  env: { MIMO_HOME: testHome },
  services: {
    sharedFossil: new DummySharedFossilServer(),
  },
});
```

## Files That DON'T Need Changes

These tests already pass `MIMO_SHARED_FOSSIL_SERVER_PORT` and don't need `DummySharedFossilServer`:
- `test/fossil-credentials.test.ts`
- `test/agent-bootstrap-integration.test.ts`

These tests don't call `sharedFossil` methods and work fine with `null`:
- ~44 other test files that don't use `createSessionsRoutes`

## Verification Commands

```bash
cd packages/mimo-platform

# Run specific tests that were modified
bun test test/shared-fossil-server.test.ts
bun test test/frame-buffers.test.ts
bun test test/sessions.test.ts
bun test test/sessions-context.test.ts
```

## Expected Outcome
All modified tests pass with `DummySharedFossilServer` explicitly injected.
