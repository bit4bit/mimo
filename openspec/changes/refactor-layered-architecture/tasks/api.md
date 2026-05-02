## API Layer Tasks

### 3.1 Create API Structure

- [ ] 3.1.1 Create `api/` directory structure:
  - `api/rest/`
  - `api/websocket/`
  - `api/mcp/`
  - `api/shared/` (for shared middleware, response utils)

### 3.2 Migrate Internal API

- [ ] 3.2.1 Move `api/internal/shared/auth.ts` to `api/shared/auth.ts`
- [ ] 3.2.2 Move `api/internal/shared/response.ts` to `api/shared/response.ts`
- [ ] 3.2.3 Move `api/internal/shared/client.ts` to `api/shared/client.ts`
- [ ] 3.2.4 Move `api/internal/shared/types.ts` to `api/shared/types.ts`
- [ ] 3.2.5 Move `api/internal/index.ts` to `api/rest/index.ts`

### 3.3 Merge Domain APIs

- [ ] 3.3.1 Merge `api/internal/agents/routes.ts` into `api/rest/agents.ts`
- [ ] 3.3.2 Merge `api/internal/sessions/routes.ts` into `api/rest/sessions.ts`
- [ ] 3.3.3 Merge `api/internal/projects/routes.ts` into `api/rest/projects.ts`
- [ ] 3.3.4 Merge `api/internal/auth/routes.ts` into `api/rest/auth.ts`
- [ ] 3.3.5 Merge `api/internal/credentials/routes.ts` into `api/rest/credentials.ts`
- [ ] 3.3.6 Merge `api/internal/mcp-servers/routes.ts` into `api/rest/mcp-servers.ts`
- [ ] 3.3.7 Merge `api/internal/config/routes.ts` into `api/rest/config.ts`
- [ ] 3.3.8 Merge `api/internal/dashboard/routes.ts` into `api/rest/dashboard.ts`
- [ ] 3.3.9 Merge `api/internal/summary/routes.ts` into `api/rest/summary.ts`
- [ ] 3.3.10 Merge `api/internal/chat/routes.ts` into `api/rest/chat.ts`

### 3.4 Migrate Feature API Routes

- [ ] 3.4.1 Move `sync/routes.ts` to `api/rest/sync.ts`
- [ ] 3.4.2 Move `commits/routes.ts` to `api/rest/commits.ts`
- [ ] 3.4.3 Move `files/routes.ts` to `api/rest/files.ts`
- [ ] 3.4.4 Move `help/routes.ts` to `api/rest/help.ts`
- [ ] 3.4.5 Move `auto-commit/routes.ts` to `api/rest/auto-commit.ts`

### 3.5 Migrate WebSocket Handlers

- [ ] 3.5.1 Move `ws/session-broadcast.ts` to `api/websocket/session-broadcast.ts`
- [ ] 3.5.2 Extract agent WebSocket handler from `index.tsx` to `api/websocket/agent.ts`
- [ ] 3.5.3 Extract chat WebSocket handler from `index.tsx` to `api/websocket/chat.ts`
- [ ] 3.5.4 Extract files WebSocket handler from `index.tsx` to `api/websocket/files.ts`

### 3.6 Migrate MCP Endpoint

- [ ] 3.6.1 Move `mcp/server.ts` to `api/mcp/server.ts`
- [ ] 3.6.2 Move `mcp/platform-config.ts` to `api/mcp/platform-config.ts`
- [ ] 3.6.3 Move `mcp/token-store.ts` to `api/mcp/token-store.ts`

### 3.7 API Layer Validation

- [ ] 3.7.1 Verify NO file under `api/` imports from `web/`
- [ ] 3.7.2 Verify all API files delegate business logic to `domain/`
- [ ] 3.7.3 Verify `api/internal/` directory is deleted
- [ ] 3.7.4 Run tests to verify API layer handles transport only
