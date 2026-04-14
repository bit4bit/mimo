## Context

The codebase has been undergoing a systematic refactoring to move from global singletons to dependency injection via `mimoContext`. Repositories have already been migrated - they now receive paths via constructor from `createMimoContext()`. Services and utility modules still import `config/paths.ts` directly.

The current `config/paths.ts` exports:
- `getPaths()` - Returns base paths object
- `ensureMimoHome()` - Creates directory structure
- `getUserPath()`, `getProjectPath()`, `getSessionPath()`, `getAgentPath()` - Specific path functions
- `getUserCredentialsPath()`, `getCredentialsPath()` - Credential paths

These functions use a hardcoded `~/.mimo` home directory or rely on environment variables imported at module load time.

## Goals / Non-Goals

**Goals:**
- Consolidate all path management in `mimoContext`
- Remove direct imports of `config/paths.ts` from services
- Maintain backward compatibility for tests (they should continue working with minimal changes)
- Enable the eventual deletion of `config/paths.ts`
- Preserve all existing behavior (pure refactoring)

**Non-Goals:**
- Changing path structure or directory layout
- Adding new path-related features
- Modifying repository interfaces (already context-injected)
- Changing external API behavior
- Performance optimization

## Decisions

### Decision 1: Service Factory Pattern for Chat and FrameState

**Choice:** Convert `chat.ts` and `frame-state.ts` from singleton exports to factory functions that receive paths.

**Rationale:**
- Follows existing pattern used for routes (`createSessionsRoutes`, etc.)
- Maintains testability by allowing injection of test paths
- Simple migration - existing singleton usage becomes `createChatService(context.paths)`

**Alternative Considered:** Class-based services with constructor injection
- Rejected: More verbose, not consistent with existing code style

### Decision 2: Extend mimoContext.services for Path-Dependent Services

**Choice:** Add `chat` and `scc` services to `mimoContext.services`.

**Rationale:**
- Centralizes service lifecycle management
- Ensures services are initialized with correct paths
- Consistent with existing `auth` and `agents` services

**Code Change:**
```typescript
services: {
  auth: JwtService;
  agents: AgentService;
  chat: ChatService;      // NEW
  scc: SccService;        // NEW
}
```

### Decision 3: Configure Pattern for Existing Services

**Choice:** Services that already have `configure()` methods (SccService, SharedFossilServer) will be called from `createMimoContext()`.

**Rationale:**
- Minimal changes to existing service code
- `SccService` and `SharedFossilServer` already support this pattern
- Avoids breaking their internal state management

### Decision 4: Inline Path Functions for Dynamic Paths

**Choice:** Functions like `getProjectPath(projectId)` will be replaced with inline `join(context.paths.projects, projectId)` at call sites.

**Rationale:**
- These are simple path joins, no complex logic
- Eliminates need for helper functions in mimoContext
- Clearer intent - shows exactly how path is constructed

### Decision 5: Script Migration Strategy

**Choice:** Migration scripts will create a minimal mimoContext or inline the path construction.

**Rationale:**
- Scripts are one-time utilities, not worth full context setup
- `ensurePaths()` logic is simple enough to inline if needed

## Migration Plan

### Phase 1: Foundation (Ready)
1. ✅ Create OpenSpec change with proposal and design

### Phase 2: Core Services Migration (Tasks 1-4)
1. Refactor `chat.ts` to factory pattern, add to mimoContext
2. Refactor `frame-state.ts` to factory pattern, add to mimoContext
3. Update `scc-service.ts` to use configured paths consistently
4. Update `shared-fossil-server.ts` configuration from context

### Phase 3: VCS and Config (Tasks 5-7)
5. Update `vcs/index.ts` to receive path resolution from context
6. Update `config/service.ts` for config path injection
7. Update migration scripts

### Phase 4: Tests (Tasks 8)
8. Update test files to use `createMimoContext().paths`

### Phase 5: Cleanup (Tasks 9)
9. Delete `config/paths.ts` and verify no remaining imports

### Rollback Strategy
- Each task is independent - can revert individual files
- `config/paths.ts` remains until final task
- Tests can temporarily use both patterns during transition

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missing an import of paths.ts | Medium | Grep for all imports before final deletion, CI check |
| Service initialization order issues | Low | `createMimoContext()` ensures proper initialization order |
| Test file breakage | Low | Tests already use createMimoContext, paths available via ctx.paths |
| Scripts failing | Low | Manual verification of migration scripts before deletion |
| Increased verbosity at call sites | Medium | Inline path joins are more explicit but slightly more verbose |

## Open Questions

None at this time.
