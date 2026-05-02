## Validation and Cleanup Tasks

### 6.1 Layer Dependency Validation

- [ ] 6.1.1 Verify `domain/` has no imports from `api/`, `web/`, or `infrastructure/server/`
- [ ] 6.1.2 Verify `api/` has no imports from `web/`
- [ ] 6.1.3 Verify `web/` has no imports from `domain/`
- [ ] 6.1.4 Verify `infrastructure/` has no imports from `domain/`, `api/`, or `web/`

### 6.2 Architecture Rules Validation

- [ ] 6.2.1 Verify NO JSX/TSX files exist outside `web/` layer
- [ ] 6.2.2 Verify NO HTTP route handlers exist outside `api/` layer
- [ ] 6.2.3 Verify NO business logic (services, repositories) exist outside `domain/` layer
- [ ] 6.2.4 Verify NO server bootstrap code exists outside `infrastructure/` layer

### 6.3 Test Suite

- [ ] 6.3.1 Run `bun test` in `packages/mimo-platform`
- [ ] 6.3.2 Run `bun run test.full` for integration tests
- [ ] 6.3.3 Fix any failing tests
- [ ] 6.3.4 Run `bun build` to verify compilation succeeds

### 6.4 Cleanup

- [ ] 6.4.1 Delete all empty directories left from migration
- [ ] 6.4.2 Remove any old import path aliases if no longer needed
- [ ] 6.4.3 Update `package.json` exports or paths if needed
- [ ] 6.4.4 Update documentation referencing old folder structure

### 6.5 Final Review

- [ ] 6.5.1 Review git diff to ensure only moves and import changes
- [ ] 6.5.2 Verify no accidental file deletions
- [ ] 6.5.3 Commit changes with clear message describing the reorganization
