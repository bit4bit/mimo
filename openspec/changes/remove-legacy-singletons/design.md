## Context

The mimo-platform uses a `mimoContext` object (created in `context/mimo-context.ts`) that holds all resolved paths, environment variables, repositories, and services. After commit `c7594f6` moved path resolution into `createMimoContext()`, several module-level singletons (`sessionRepository`, `agentRepository`, `projectRepository`, etc.) lost their required constructor arguments and crash immediately on import.

Four route files (`createAuthRoutes`, `createSessionsRoutes`, `createProjectsRoutes`, `createAgentsRoutes`) already follow the correct pattern: they accept `mimoContext` as an optional parameter and fall back to defaults only for tests. The remaining routes and services bypass `mimoContext` entirely by importing singletons directly.

## Goals / Non-Goals

**Goals:**
- All route handlers receive repos/services from `mimoContext`, not from module-level singletons
- `MimoContext.services` is extended to cover every service used at route level
- `CommitService` and `FileSyncService` gain constructor injection so they can be wired via context
- All legacy singleton exports are deleted from repository/service files
- No change to external HTTP API shape, database layout, or wire protocols

**Non-Goals:**
- Refactoring the mimo-agent (separate package)
- Changing any business logic or service behavior
- Making `mimoContext` required (factory functions keep optional param for test ergonomics)

## Decisions

### D1 — Extend `MimoContext.services`, not a separate registry

Add `commitService`, `autoCommitService`, `fileSyncService`, `mcpServerService`, `configService`, and `impactCalculator` directly to the existing `services` object on `MimoContext`.

**Why over a separate DI container:** The codebase already passes `mimoContext` through every route factory. Adding to `services` is zero new abstraction and stays consistent with how `auth`, `agents`, `chat`, `frameState`, and `scc` are already accessed.

### D2 — Factory function pattern for every route file

Every route file gets a `createXxxRoutes(mimoContext?: XxxRoutesContext)` function. The module-level route object (`const router = createXxxRouter()`) is removed. `index.tsx` calls the factory and passes `mimoContext`.

**Why optional mimoContext:** Existing tests instantiate routes without a context. Keeping the parameter optional lets tests continue passing without changes during migration; once all tests use context the optionality can be removed.

### D3 — Constructor injection for CommitService and FileSyncService

Both currently import repos at module scope with no constructor. Add a `deps` interface with defaults that point to the (now-deleted) singletons replaced by the context-supplied instances.

**Why not a static factory:** The existing codebase uses `new XxxService(deps)` consistently. A constructor keeps the pattern uniform.

### D4 — Delete singletons, do not deprecate

Remove the `export const xxxRepository = ...` lines entirely. Leaving them as deprecated re-exports would keep broken code compiling and delay cleanup.

**Risk:** Any consumer outside mimo-platform that imports singletons will get a compile error. Acceptable — those consumers must migrate to mimoContext.

## Risks / Trade-offs

- **Test breakage** → Mitigation: factory functions keep `mimoContext` optional; tests that pass no context will use whatever default is supplied. Run `bun test` before and after each file changed.
- **Wide diff** → Mitigation: change is purely structural (no logic changes), making review straightforward. Each file can be reviewed independently.
- **`index.tsx` complexity** → Mitigation: the entry point already imports many factories; this change replaces static imports with factory calls, which is simpler.

## Migration Plan

1. Add constructor injection to `CommitService` and `FileSyncService`
2. Extend `MimoContext` interface and `createMimoContext()` with new services (depends on step 1)
3. Convert each route file to a factory function (order independent after step 2)
4. Update `index.tsx` to call all factories with `mimoContext`
5. Delete singleton exports from all repository/service files
6. Run `bun test` in `mimo-platform`; fix any failures
7. Start platform + agent; confirm no runtime errors
