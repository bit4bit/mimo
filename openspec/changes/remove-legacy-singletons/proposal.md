## Why

After refactoring path management into `mimoContext` (commit `c7594f6`), all legacy repository/service singletons lost their required constructor arguments and began crashing at runtime with `TypeError: undefined is not an object`. These singletons must be removed and their consumers migrated to receive dependencies through `mimoContext`, matching the injection pattern already established by `createAuthRoutes`, `createSessionsRoutes`, `createProjectsRoutes`, and `createAgentsRoutes`.

## What Changes

- **BREAKING** — Remove `export const sessionRepository` from `sessions/repository.ts`
- **BREAKING** — Remove `export const agentRepository` from `agents/repository.ts`
- **BREAKING** — Remove `export const projectRepository` from `projects/repository.ts`
- **BREAKING** — Remove `export const impactRepository` from `impact/repository.ts`
- **BREAKING** — Remove `export const mcpServerRepository` from `mcp-servers/repository.ts`
- **BREAKING** — Remove `export const commitService` from `commits/service.ts`
- **BREAKING** — Remove `export const autoCommitService` from `auto-commit/service.ts`
- **BREAKING** — Remove `export const fileSyncService` from `sync/service.ts`
- Add constructor injection to `CommitService` and `FileSyncService` (currently hard-code their deps)
- Extend `MimoContext.services` with `commitService`, `autoCommitService`, `fileSyncService`, `mcpServerService`, `configService`, `impactCalculator`
- Convert `auto-commit/routes.ts`, `commits/routes.ts`, `sync/routes.ts`, `dashboard/routes.tsx`, `credentials/routes.tsx`, `config/routes.tsx`, `mcp-servers/routes.tsx` to factory functions that accept `mimoContext`
- Update `index.tsx` to pass `mimoContext` to all route factories

## Capabilities

### New Capabilities

- `context-injection`: All platform route handlers and services receive their repository/service dependencies exclusively through `mimoContext`, with no module-level singleton fallbacks.

### Modified Capabilities

*(none — no user-visible requirements change; this is a structural implementation fix)*

## Impact

- **`packages/mimo-platform/src/context/mimo-context.ts`** — extended with new services
- **`packages/mimo-platform/src/index.tsx`** — all route registrations updated
- **`packages/mimo-platform/src/commits/service.ts`** — constructor injection added
- **`packages/mimo-platform/src/sync/service.ts`** — constructor injection added
- All route files listed above — converted to factory functions
- All repository files listed above — singleton exports removed
- No external API surface changes; no database or protocol changes
