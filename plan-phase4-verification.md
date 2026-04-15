# Phase 4: Verify All Changes

## Objective
Ensure all changes compile and tests pass.

## Verification Steps

### Step 4.1: TypeScript Compilation

**Command:**
```bash
cd packages/mimo-platform && bun tsc --noEmit
```

**Expected Result:**
- No TypeScript errors
- No errors related to `sharedFossil` being `null`

### Step 4.2: Run Modified Test Files

**Commands:**
```bash
cd packages/mimo-platform
bun test test/shared-fossil-server.test.ts
bun test test/frame-buffers.test.ts
bun test test/sessions.test.ts
bun test test/sessions-context.test.ts
```

**Expected Results:**
All tests pass successfully.

### Step 4.3: Run Full Test Suite

**Command:**
```bash
cd packages/mimo-platform && bun test
```

**Expected Results:**
- Full test suite passes
- No regressions in any test files

### Step 4.4: Optional - Production Build Verification

**Command:**
```bash
cd packages/mimo-platform && bun run build
```

**Expected Results:**
- Build succeeds without errors
- Production entry point properly initializes shared fossil server

## Success Criteria

| Check | Status |
|-------|--------|
| TypeScript compiles without errors | ⬜ |
| Modified tests pass | ⬜ |
| Full test suite passes | ⬜ |
| No `DummySharedFossilServer` auto-instantiation in context | ⬜ |
| Production code explicitly injects `SharedFossilServer` | ⬜ |

## Rollback Plan

If issues arise:
1. Revert `mimo-context.ts` changes
2. Revert `index.tsx` changes  
3. Revert test file changes
4. Re-run tests to confirm baseline works
