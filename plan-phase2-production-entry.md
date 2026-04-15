# Phase 2: Update Production Entry Point

## Objective
Explicitly create `SharedFossilServer` before creating context and inject via `services.sharedFossil` override.

## File to Modify
`packages/mimo-platform/src/index.tsx`

## Changes Required

### Step 2.1: Update Import (Line 28)

**Current:**
```typescript
import { createMimoContext } from "./context/mimo-context.js";
```

**Change to:**
```typescript
import { createMimoContext, createSharedFossilServer } from "./context/mimo-context.js";
```

### Step 2.2: Create SharedFossilServer Before Context (After Line 31)

**Current (lines 32-46):**
```typescript
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

**Replace with:**
```typescript
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

**Note:** Remove the line `const sharedFossilServer = mimoContext.services.sharedFossil;` (line 46) since we now create it before.

## Verification
1. TypeScript compilation passes
2. Production server starts successfully
3. `SharedFossilServer` is properly injected into the context

## Expected Outcome
Production code follows dependency injection principle by explicitly creating and injecting the `SharedFossilServer` dependency.
