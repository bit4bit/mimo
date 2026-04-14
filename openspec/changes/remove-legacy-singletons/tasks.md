## 1. Constructor Injection for Hard-coded Services

- [ ] 1.1 Add `CommitServiceDeps` interface and constructor to `commits/service.ts` with deps: `sessionRepository`, `projectRepository`, `impactRepository`, `impactCalculator`, `vcs`
- [ ] 1.2 Add `FileSyncServiceDeps` interface and constructor to `sync/service.ts` with dep: `sessionRepository`

## 2. Extend MimoContext

- [ ] 2.1 Add `commitService`, `autoCommitService`, `fileSyncService`, `mcpServerService`, `configService`, `impactCalculator` to the `MimoContext.services` interface in `context/mimo-context.ts`
- [ ] 2.2 Instantiate and wire all new services inside `createMimoContext()` using the already-resolved `repos` and `paths`

## 3. Convert Route Files to Factory Functions

- [ ] 3.1 Convert `auto-commit/routes.ts` to `createAutoCommitRouter(mimoContext?)` — inject `autoCommitService`, `sessionRepository`, `agentService`, `sccService`
- [ ] 3.2 Convert `commits/routes.ts` to `createCommitRoutes(mimoContext?)` — inject `commitService`
- [ ] 3.3 Convert `sync/routes.ts` to `createSyncRoutes(mimoContext?)` — inject `fileSyncService`
- [ ] 3.4 Convert `dashboard/routes.tsx` to `createDashboardRoutes(mimoContext?)` — inject `projectRepository`, `agentRepository`, `sessionRepository`
- [ ] 3.5 Convert `credentials/routes.tsx` to `createCredentialsRoutes(mimoContext?)` — inject `credentialRepository`
- [ ] 3.6 Convert `config/routes.tsx` to `createConfigRoutes(mimoContext?)` — inject `configService`
- [ ] 3.7 Convert `mcp-servers/routes.tsx` to `createMcpServerRoutes(mimoContext?)` — inject `mcpServerService`

## 4. Update index.tsx

- [ ] 4.1 Replace static route imports with factory function imports for all converted route files
- [ ] 4.2 Call each factory with `mimoContext` when registering routes via `app.route(...)`
- [ ] 4.3 Remove bare singleton imports (`fileSyncService`, `chatService`, `sessionRepository`, `projectRepository`, `impactCalculator`, `sccService`, etc.) that are no longer needed at module scope

## 5. Delete Legacy Singleton Exports

- [ ] 5.1 Remove `export const sessionRepository` from `sessions/repository.ts` (and `homedir`/path imports added as interim patch)
- [ ] 5.2 Remove `export const agentRepository` from `agents/repository.ts` (and interim patch imports)
- [ ] 5.3 Remove `export const projectRepository` from `projects/repository.ts` (and interim patch imports)
- [ ] 5.4 Remove `export const impactRepository` from `impact/repository.ts` (and interim patch imports)
- [ ] 5.5 Remove `export const mcpServerRepository` from `mcp-servers/repository.ts` (and interim patch imports)
- [ ] 5.6 Remove `export const commitService` from `commits/service.ts`
- [ ] 5.7 Remove `export const autoCommitService` from `auto-commit/service.ts`
- [ ] 5.8 Remove `export const fileSyncService` from `sync/service.ts`

## 6. Verify

- [ ] 6.1 Run `bun test` in `packages/mimo-platform` — all tests pass
- [ ] 6.2 Start the platform (`bun run src/index.ts`) — no import/runtime errors
- [ ] 6.3 Start the agent — confirm no `TypeError: undefined is not an object` or `is not defined` errors
