## 1. Core Services Migration

- [x] 1.1 Refactor `src/sessions/chat.ts` to factory pattern
  - Create `createChatService(paths)` function
  - Change from singleton export to factory
  - Remove `getPaths()` import
  
- [x] 1.2 Refactor `src/sessions/frame-state.ts` to factory pattern
  - Create `createFrameStateService(paths)` function
  - Move path-dependent functions to service class
  - Remove `getPaths()` import

- [x] 1.3 Add services to `mimoContext`
  - Add `chat: ChatService` to `MimoContext.services` type
  - Initialize `chatService` in `createMimoContext()` with injected paths
  - Ensure proper initialization order

- [x] 1.4 Update `src/impact/scc-service.ts` to use injected paths
  - Remove `getPaths()` import from constructor
  - Use paths passed via `configure()` method
  - Update `createMimoContext()` to call `sccService.configure()` with paths

## 2. VCS Infrastructure Migration

- [x] 2.1 Update `src/vcs/shared-fossil-server.ts`
  - Ensure `configure()` is called from `createMimoContext()`
  - Remove direct `getPaths()` call in `getFossilReposDir()`
  - Use configured paths exclusively

- [x] 2.2 Update `src/vcs/index.ts`
  - Accept `getProjectPath` function via constructor or method injection
  - Remove dynamic import of `config/paths.ts`
  - Update all callers to provide project path resolution

## 3. Config Service Migration

- [x] 3.1 Update `src/config/service.ts`
  - Inject config file path via constructor
  - Remove `getPaths()` import
  - Update `createMimoContext()` to initialize config service with path

## 4. Repository Updates

- [x] 4.1 Verify repository constructors use injected paths
  - `src/agents/repository.ts` should use `agentsPath` from context
  - `src/mcp-servers/repository.ts` should use `mcpServersPath` from context
  - `src/sessions/repository.ts` should use paths from context
  - `src/auth/user.ts` should use `usersPath` from context
  - `src/projects/repository.ts` should use `projectsPath` from context
  - `src/credentials/repository.ts` should use `usersPath` from context
  - `src/impact/repository.ts` should use `projectsPath` from context

## 5. Script Migration

- [x] 5.1 Update `scripts/migrate-fossil-repos.ts`
  - Import `createMimoContext` and use `ctx.paths`
  - Or inline path construction for simple scripts

- [x] 5.2 Update `scripts/rollback-fossil-repos.ts`
  - Import `createMimoContext` and use `ctx.paths`
  - Or inline path construction for simple scripts

## 6. Test File Updates

- [x] 6.1 Update test file path imports
  - `test/credentials.test.ts`
  - `test/mcp-server-api.test.ts`
  - `test/project-sessions-link.test.ts`
  - `test/auto-commit-routes.test.ts`

- [x] 6.2 Replace direct path imports with `createMimoContext().paths`
  - Ensure tests create temporary directories
  - Use `ctx.paths.projects`, `ctx.paths.users`, etc.

## 7. Final Cleanup

- [x] 7.1 Delete `src/config/paths.ts`
  - Verify file has no remaining imports
  - Remove empty `src/config/` directory if appropriate

- [x] 7.2 Verify no remaining imports
  - Search for all references to `config/paths`
  - Search for `getPaths`, `getUserPath`, `getProjectPath`, etc.
  - Search for `from "../config/paths"` or `from "./config/paths"`

- [x] 7.3 Run full test suite
  - All tests must pass
  - No regressions

## 8. Documentation Update

- [ ] 8.1 Update any documentation referencing `config/paths.ts`
  - Check README files
  - Check architecture documentation
  - Update code comments if needed
