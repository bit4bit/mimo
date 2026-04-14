## Why

The codebase currently has two sources of truth for path management: `config/paths.ts` and `mimoContext.paths`. This duplication creates maintenance overhead and violates the dependency injection principle established by the ongoing refactoring. By moving all path responsibility to `mimoContext`, we consolidate configuration in one place, improve testability, and eliminate a global module that services currently import directly.

## What Changes

- **Remove** `packages/mimo-platform/src/config/paths.ts` file entirely
- **Migrate** all imports from `config/paths.ts` to use `mimoContext.paths`
- **Refactor** `chat.ts`, `frame-state.ts`, `scc-service.ts`, and `shared-fossil-server.ts` to receive paths via dependency injection
- **Add** new services (`chat`, `scc`) to `mimoContext.services` in `createMimoContext()`
- **Update** `vcs/index.ts` to accept project path resolution from context
- **Update** migration scripts to use mimoContext or inline paths
- **Update** tests to use `createMimoContext().paths` exclusively

## Capabilities

### New Capabilities
<!-- No new capabilities - this is pure refactoring with no behavioral changes -->
*None*

### Modified Capabilities
<!-- No spec-level requirement changes - pure implementation refactoring -->
*None*

## Impact

**Affected Code:**
- `src/config/paths.ts` (deleted)
- `src/sessions/chat.ts` (refactored to service)
- `src/sessions/frame-state.ts` (refactored to service)
- `src/impact/scc-service.ts` (paths injection)
- `src/vcs/shared-fossil-server.ts` (paths injection)
- `src/vcs/index.ts` (path resolution)
- `src/config/service.ts` (config path injection)
- `src/context/mimo-context.ts` (add services)
- Scripts: `migrate-fossil-repos.ts`, `rollback-fossil-repos.ts`
- 4+ test files using path imports

**Breaking Changes:**
- None for external APIs
- Internal: Services must be obtained from mimoContext rather than direct import

**Dependencies:**
- Requires mimoContext to be initialized before any path-dependent operations
- No new external dependencies
