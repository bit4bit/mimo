# Plan Walkthrough: Remove DummySharedFossilServer Instantiation

## Overview

**Problem**: `mimo-context.ts` lines 195-201 automatically instantiates `new DummySharedFossilServer()` when `MIMO_SHARED_FOSSIL_SERVER_PORT` is not provided. This violates the AGENTS.md dependency injection principle.

**Goal**: Remove automatic instantiation - dependencies must be injected by the caller, never created internally.

**Impact Analysis**:
- 1 production file to modify (`index.tsx`)
- 1 core context file to modify (`mimo-context.ts`)
- ~48 test files using `createMimoContext()` - most will work with `null`, ~4 may need explicit injection

---

## Phase 1: Modify Core Context File

### Step 1.1: Update `packages/mimo-platform/src/context/mimo-context.ts`

**What to change**: Remove auto-instantiation logic, default to `null`

**Current code (lines 193-201)**:
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

**Replace with**:
```typescript
// sharedFossil must be explicitly injected - no auto-instantiation
const sharedFossilServer =
  overrides.services && "sharedFossil" in overrides.services
    ? overrides.services.sharedFossil!
    : null;
```

**Also**: Remove import of `DummySharedFossilServer` (line 25), keep `SharedFossilServer` import.

**Expected outcome**: `mimo-context.ts` no longer instantiates any fossil server internally. `sharedFossil` defaults to `null`.

---

## Phase 2: Update Production Entry Point

### Step 2.1: Update `packages/mimo-platform/src/index.tsx`

**What to change**: Explicitly create `SharedFossilServer` before creating context, inject via override

**Current code (lines 22-46)**:
```typescript
import { createMimoContext } from "./context/mimo-context.js";
// ... other imports

const app = new Hono();
const _port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const mimoContext = createMimoContext({
  env: {
    PORT: _port,
    PLATFORM_URL: process.env.PLATFORM_URL ?? `http://localhost:${_port}`,
    JWT_SECRET:
      process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: process.env.MIMO_HOME,
    FOSSIL_REPOS_DIR: process.env.FOSSIL_REPOS_DIR,
    MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
      ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
      : 8000, // Provide default port for production
  },
});
const sharedFossilServer = mimoContext.services.sharedFossil;
```

**Replace with**:
```typescript
import { createMimoContext, createSharedFossilServer } from "./context/mimo-context.js";
// ... other imports

const app = new Hono();
const _port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Create shared fossil server explicitly before context (dependency injection)
const sharedFossilServer = createSharedFossilServer({
  PORT: _port,
  PLATFORM_URL: process.env.PLATFORM_URL ?? `http://localhost:${_port}`,
  JWT_SECRET:
    process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
  MIMO_HOME: process.env.MIMO_HOME ?? "",
  FOSSIL_REPOS_DIR: process.env.FOSSIL_REPOS_DIR ?? "",
  MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
    ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
    : 8000, // Default port for production
});

const mimoContext = createMimoContext({
  env: {
    PORT: _port,
    PLATFORM_URL: process.env.PLATFORM_URL ?? `http://localhost:${_port}`,
    JWT_SECRET:
      process.env.JWT_SECRET ?? "your-secret-key-change-in-production",
    MIMO_HOME: process.env.MIMO_HOME,
    FOSSIL_REPOS_DIR: process.env.FOSSIL_REPOS_DIR,
    MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
      ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
      : 8000,
  },
  services: {
    sharedFossil: sharedFossilServer,
  },
});
```

**Expected outcome**: Production code explicitly creates and injects `SharedFossilServer` via `services.sharedFossil` override.

---

## Phase 3: Update Tests That Need DummySharedFossilServer

### Step 3.1: Identify tests that call `sharedFossil` methods

**Command to find**:
```bash
grep -r "sharedFossil\|services\.sharedFossil" packages/mimo-platform/test/ --include="*.ts"
```

**Files likely needing updates**:
| File | Why |
|------|-----|
| `test/shared-fossil-server.test.ts` | Already passes `sharedFossil: null` - change to explicit `DummySharedFossilServer` |
| `test/fossil-credentials.test.ts` | Already passes port - no change needed |
| `test/agent-bootstrap-integration.test.ts` | Already passes port - no change needed |
| `test/frame-buffers.test.ts` | Uses `createSessionsRoutes` - needs `DummySharedFossilServer` |
| `test/sessions.test.ts` | Uses `createSessionsRoutes` - needs `DummySharedFossilServer` |
| `test/sessions-context.test.ts` | Uses `createSessionsRoutes` - needs `DummySharedFossilServer` |

### Step 3.2: Update test files using `createSessionsRoutes`

**Pattern for each test file**:

**Add import** at top:
```typescript
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";
```

**Modify `createMimoContext` call**:
```typescript
const ctx = createMimoContext({
  env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
  services: {
    sharedFossil: new DummySharedFossilServer(),
  },
});
```

**Files to update**:
1. `test/frame-buffers.test.ts` - lines 24-26
2. `test/sessions.test.ts` - lines 28-30
3. `test/sessions-context.test.ts` - lines 23-24

### Step 3.3: Update `test/shared-fossil-server.test.ts`

**Current (lines 30-32)**:
```typescript
services: {
  sharedFossil: null as any, // Skip creating - test creates its own
},
```

**Replace with**:
```typescript
services: {
  sharedFossil: new DummySharedFossilServer(),
},
```

**Also add import** at top (line 6-8):
```typescript
import {
  SharedFossilServer,
  DummySharedFossilServer,
  normalizeSessionIdForFossil,
} from "../src/vcs/shared-fossil-server.js";
```

---

## Phase 4: Verify Changes

### Step 4.1: Run TypeScript compilation

**Command**:
```bash
cd packages/mimo-platform && bun tsc --noEmit
```

**Expected**: No TypeScript errors related to `sharedFossil` being `null`.

### Step 4.2: Run specific test files

**Command**:
```bash
cd packages/mimo-platform && bun test test/shared-fossil-server.test.ts
cd packages/mimo-platform && bun test test/frame-buffers.test.ts
cd packages/mimo-platform && bun test test/sessions.test.ts
cd packages/mimo-platform && bun test test/sessions-context.test.ts
```

**Expected**: All tests pass.

### Step 4.3: Run full test suite

**Command**:
```bash
cd packages/mimo-platform && bun test
```

**Expected**: Full test suite passes.

---

## Summary of Changes

| Phase | File(s) | Change Type |
|-------|---------|-------------|
| 1 | `src/context/mimo-context.ts` | Remove auto-instantiation, default to `null` |
| 2 | `src/index.tsx` | Explicitly create and inject `SharedFossilServer` |
| 3 | `test/shared-fossil-server.test.ts` | Explicitly inject `DummySharedFossilServer` |
| 3 | `test/frame-buffers.test.ts` | Explicitly inject `DummySharedFossilServer` |
| 3 | `test/sessions.test.ts` | Explicitly inject `DummySharedFossilServer` |
| 3 | `test/sessions-context.test.ts` | Explicitly inject `DummySharedFossilServer` |

**Total files modified**: 6

**Files that work with `null` (no changes needed)**: ~44 test files that don't directly call `sharedFossil.getUrl()`, `sharedFossil.isRunning()`, or `sharedFossil.ensureRunning()`.
