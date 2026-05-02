## 1. Infrastructure

- [ ] 1.1 Create `src/api/internal/` directory structure
- [ ] 1.2 Create base response utilities (`src/api/internal/shared/response.ts`)
- [ ] 1.3 Create auth middleware for internal API (`src/api/internal/shared/auth.ts`)
- [ ] 1.4 Create internal API router factory with MimoContext injection
- [ ] 1.5 Mount internal API router at `/api/internal/*` in main app

## 2. Projects Domain

- [ ] 2.1 Create projects internal API handlers (`src/api/internal/projects/handlers.ts`)
- [ ] 2.2 Create projects internal API routes (`src/api/internal/projects/routes.ts`)
- [ ] 2.3 Create projects internal API types (`src/api/internal/projects/types.ts`)
- [ ] 2.4 Refactor `projects/routes.tsx` to proxy to internal API
- [ ] 2.5 Update projects route tests

## 3. Sessions Domain

- [ ] 3.1 Create sessions internal API handlers (`src/api/internal/sessions/handlers.ts`)
- [ ] 3.2 Create sessions internal API routes (`src/api/internal/sessions/routes.ts`)
- [ ] 3.3 Create sessions internal API types (`src/api/internal/sessions/types.ts`)
- [ ] 3.4 Refactor `sessions/routes.tsx` to proxy to internal API
- [ ] 3.5 Update sessions route tests

## 4. Agents Domain

- [ ] 4.1 Create agents internal API handlers (`src/api/internal/agents/handlers.ts`)
- [ ] 4.2 Create agents internal API routes (`src/api/internal/agents/routes.ts`)
- [ ] 4.3 Create agents internal API types (`src/api/internal/agents/types.ts`)
- [ ] 4.4 Refactor `agents/routes.tsx` to proxy to internal API
- [ ] 4.5 Update agents route tests

## 5. Dashboard Domain

- [ ] 5.1 Create dashboard internal API handlers (`src/api/internal/dashboard/handlers.ts`)
- [ ] 5.2 Create dashboard internal API routes (`src/api/internal/dashboard/routes.ts`)
- [ ] 5.3 Create dashboard internal API types (`src/api/internal/dashboard/types.ts`)
- [ ] 5.4 Refactor `dashboard/routes.tsx` to proxy to internal API
- [ ] 5.5 Update dashboard route tests

## 6. Credentials Domain

- [ ] 6.1 Create credentials internal API handlers (`src/api/internal/credentials/handlers.ts`)
- [ ] 6.2 Create credentials internal API routes (`src/api/internal/credentials/routes.ts`)
- [ ] 6.3 Create credentials internal API types (`src/api/internal/credentials/types.ts`)
- [ ] 6.4 Refactor `credentials/routes.tsx` to proxy to internal API
- [ ] 6.5 Update credentials route tests

## 7. Config Domain

- [ ] 7.1 Create config internal API handlers (`src/api/internal/config/handlers.ts`)
- [ ] 7.2 Create config internal API routes (`src/api/internal/config/routes.ts`)
- [ ] 7.3 Create config internal API types (`src/api/internal/config/types.ts`)
- [ ] 7.4 Refactor `config/routes.tsx` to proxy to internal API
- [ ] 7.5 Update config route tests

## 8. MCP Servers Domain

- [ ] 8.1 Create mcp-servers internal API handlers (`src/api/internal/mcp-servers/handlers.ts`)
- [ ] 8.2 Create mcp-servers internal API routes (`src/api/internal/mcp-servers/routes.ts`)
- [ ] 8.3 Create mcp-servers internal API types (`src/api/internal/mcp-servers/types.ts`)
- [ ] 8.4 Refactor `mcp-servers/routes.tsx` to proxy to internal API
- [ ] 8.5 Update mcp-servers route tests

## 9. Summary Domain

- [ ] 9.1 Create summary internal API handlers (`src/api/internal/summary/handlers.ts`)
- [ ] 9.2 Create summary internal API routes (`src/api/internal/summary/routes.ts`)
- [ ] 9.3 Create summary internal API types (`src/api/internal/summary/types.ts`)
- [ ] 9.4 Refactor `summary/routes.tsx` to proxy to internal API
- [ ] 9.5 Update summary route tests

## 10. Auth Domain

- [ ] 10.1 Create auth internal API handlers (`src/api/internal/auth/handlers.ts`)
- [ ] 10.2 Create auth internal API routes (`src/api/internal/auth/routes.ts`)
- [ ] 10.3 Create auth internal API types (`src/api/internal/auth/types.ts`)
- [ ] 10.4 Refactor `auth/routes.tsx` to proxy to internal API
- [ ] 10.5 Update auth route tests

## 11. Testing & Verification

- [ ] 11.1 Create integration tests for internal API endpoints
- [ ] 11.2 Verify all web routes still function correctly
- [ ] 11.3 Test JWT token forwarding works correctly
- [ ] 11.4 Verify error handling is consistent
- [ ] 11.5 Run full test suite

## 12. Documentation & Cleanup

- [ ] 12.1 Add JSDoc comments to internal API handlers
- [ ] 12.2 Update AGENTS.md if architecture sections exist
- [ ] 12.3 Remove unused imports from refactored routes
- [ ] 12.4 Create architecture decision record (ADR) documenting the refactor
