## ADDED Requirements

### Requirement: Route handlers receive dependencies through mimoContext
All HTTP route handlers SHALL receive their repository and service dependencies exclusively through a `mimoContext` parameter passed to their factory function. No route handler SHALL import a repository or service singleton directly from a module.

#### Scenario: Route factory called with mimoContext
- **WHEN** `index.tsx` calls a route factory (e.g. `createCommitRoutes(mimoContext)`)
- **THEN** the route handler uses the repository/service instance from `mimoContext.repos` or `mimoContext.services`

#### Scenario: Route factory called without mimoContext (test context)
- **WHEN** a route factory is called with no argument (e.g. in tests)
- **THEN** the route handler uses a safe default instance that does not crash on import

### Requirement: MimoContext.services includes all platform services
The `MimoContext` interface SHALL expose `commitService`, `autoCommitService`, `fileSyncService`, `mcpServerService`, `configService`, and `impactCalculator` under its `services` property so they can be injected into route factories.

#### Scenario: All services accessible from context
- **WHEN** `createMimoContext()` is called
- **THEN** the returned context has non-null values for `services.commitService`, `services.autoCommitService`, `services.fileSyncService`, `services.mcpServerService`, `services.configService`, and `services.impactCalculator`

### Requirement: Services support constructor injection of dependencies
`CommitService` and `FileSyncService` SHALL accept their repository dependencies through a constructor `deps` parameter so they can be instantiated with context-supplied repositories.

#### Scenario: CommitService constructed with injected repos
- **WHEN** `new CommitService({ sessionRepository, projectRepository, impactRepository, impactCalculator })` is called
- **THEN** the service uses the provided instances for all operations

#### Scenario: FileSyncService constructed with injected sessionRepository
- **WHEN** `new FileSyncService({ sessionRepository })` is called
- **THEN** the service uses the provided instance to resolve session paths

### Requirement: Legacy singleton exports are removed
The following module-level singleton exports SHALL NOT exist: `sessionRepository`, `agentRepository`, `projectRepository`, `impactRepository`, `mcpServerRepository`, `commitService`, `autoCommitService`, `fileSyncService`. Any import of these names SHALL result in a compile error.

#### Scenario: Singleton import causes compile error
- **WHEN** a file attempts to import `sessionRepository` from `sessions/repository.ts`
- **THEN** the TypeScript compiler reports an error (no such export)
