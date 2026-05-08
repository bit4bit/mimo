## 1. Shared Utilities

- [x] 1.1 Create `src/api/internal/shared/token.ts` with `extractTokenFromCookie()` function
- [x] 1.2 Create `src/api/internal/shared/proxy.ts` with shared proxy helper if needed
- [x] 1.3 Update Dashboard routes to use shared token extraction
- [x] 1.4 Update Credentials routes to use shared token extraction

## 2. Update Projects Routes (Direct Handler → HTTP Proxy)

- [x] 2.1 Update GET `/projects` to use HTTP fetch to `/api/internal/projects`
- [x] 2.2 Update GET `/projects/:id` to use HTTP fetch to `/api/internal/projects/:id`
- [x] 2.3 Update POST `/projects` to use HTTP fetch to `/api/internal/projects`
- [x] 2.4 Update GET `/projects/:id/edit` to use HTTP fetch to `/api/internal/projects/:id`
- [x] 2.5 Update POST `/projects/:id/edit` to use HTTP fetch to `/api/internal/projects/:id`
- [x] 2.6 Remove `createMockInternalContext()` function from projects routes
- [x] 2.7 Update projects routes tests to mock HTTP calls

## 3. Update Sessions Routes (Direct Handler → HTTP Proxy)

- [x] 3.1 Update GET `/sessions` to use HTTP fetch to `/api/internal/sessions`
- [x] 3.2 Update GET `/sessions/:id` to use HTTP fetch to `/api/internal/sessions/:id`
- [x] 3.3 Update POST `/sessions` to use HTTP fetch to `/api/internal/sessions`
- [x] 3.4 Update GET `/sessions/:id/chat` to use HTTP fetch to `/api/internal/sessions/:id/chat`
- [x] 3.5 Update PUT `/sessions/:id` to use HTTP fetch to `/api/internal/sessions/:id`
- [x] 3.6 Update DELETE `/sessions/:id` to use HTTP fetch to `/api/internal/sessions/:id`
- [x] 3.7 Remove `createMockInternalContext()` function from sessions routes
- [x] 3.8 Update sessions routes tests to mock HTTP calls

## 4. Update Agents Routes (Direct Handler → HTTP Proxy)

- [x] 4.1 Update GET `/agents` to use HTTP fetch to `/api/internal/agents`
- [x] 4.2 Update GET `/agents/:id` to use HTTP fetch to `/api/internal/agents/:id`
- [x] 4.3 Update POST `/agents` to use HTTP fetch to `/api/internal/agents`
- [x] 4.4 Update PUT `/agents/:id` to use HTTP fetch to `/api/internal/agents/:id`
- [x] 4.5 Update DELETE `/agents/:id` to use HTTP fetch to `/api/internal/agents/:id`
- [x] 4.6 Update GET `/agents/:id/capabilities` to use HTTP fetch
- [x] 4.7 Remove `createInternalApiContext()` function from agents routes
- [x] 4.8 Update agents routes tests to mock HTTP calls

## 5. Refactor Config Routes (Direct Service → HTTP Proxy)

- [x] 5.1 Update GET `/config` to use HTTP fetch to `/api/internal/config`
- [x] 5.2 Update POST `/config` to use HTTP fetch to `/api/internal/config`
- [x] 5.3 Update POST `/config/reset` to use HTTP fetch to `/api/internal/config/reset`
- [x] 5.4 Update GET `/config/api` to use HTTP fetch to `/api/internal/config`
- [x] 5.5 Update POST `/config/api` to use HTTP fetch to `/api/internal/config`
- [x] 5.6 Update config routes tests to mock HTTP calls

## 6. Refactor MCP Servers Routes (Direct Service → HTTP Proxy)

- [x] 6.1 Update GET `/mcp-servers` to use HTTP fetch to `/api/internal/mcp-servers`
- [x] 6.2 Update GET `/mcp-servers/:id/edit` to use HTTP fetch
- [x] 6.3 Update POST `/mcp-servers` to use HTTP fetch
- [x] 6.4 Update POST `/mcp-servers/:id` to use HTTP fetch
- [x] 6.5 Update DELETE `/mcp-servers/:id` to use HTTP fetch
- [x] 6.6 Update mcp-servers routes tests to mock HTTP calls

## 7. Refactor Summary Routes (Direct Service → HTTP Proxy)

- [x] 7.1 Update POST `/summary/refresh` to use HTTP fetch to `/api/internal/summary/refresh`
- [x] 7.2 Update GET `/summary/latest` to use HTTP fetch to `/api/internal/summary/latest`
- [x] 7.3 Update summary routes tests to mock HTTP calls

## 8. Refactor Auth Routes (Direct Service → HTTP Proxy)

- [x] 8.1 Update POST `/auth/register` to use HTTP fetch to `/api/internal/auth/register`
- [x] 8.2 Update POST `/auth/login` to use HTTP fetch to `/api/internal/auth/login`
- [x] 8.3 Keep GET `/auth/logout` in routes (cookie clearing)
- [x] 8.4 Update auth routes tests to mock HTTP calls

## 9. Cleanup

- [x] 9.1 Remove `createMockInternalContext()` function entirely
- [x] 9.2 Remove `createInternalApiContext()` function entirely
- [x] 9.3 Verify no direct handler imports remain in routes
- [x] 9.4 Verify no direct service calls remain in routes (except Dashboard, Credentials which are already correct)
- [x] 9.5 Run full test suite to verify all routes work

## 10. Documentation

- [x] 10.1 Document the standardized proxy pattern
- [x] 10.2 Update AGENTS.md if needed with architecture notes
- [x] 10.3 Add code comments explaining the proxy pattern
