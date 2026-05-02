## Frontend (Web Layer) Tasks

### 4.1 Create Web Structure

- [ ] 4.1.1 Create `web/` directory structure:
  - `web/pages/`
  - `web/components/`
  - `web/shared/` (for frontend utilities if any)

### 4.2 Migrate Shared Components

- [ ] 4.2.1 Move `components/DashboardPage.tsx` to `web/pages/DashboardPage.tsx`
- [ ] 4.2.2 Move `components/LoginPage.tsx` to `web/pages/LoginPage.tsx`
- [ ] 4.2.3 Move `components/RegisterPage.tsx` to `web/pages/RegisterPage.tsx`
- [ ] 4.2.4 Move `components/Layout.tsx` to `web/components/Layout.tsx`
- [ ] 4.2.5 Move `components/DataTable.tsx` to `web/components/DataTable.tsx`
- [ ] 4.2.6 Move all other page components from `components/` to `web/pages/`
- [ ] 4.2.7 Move all shared UI components from `components/` to `web/components/`
- [ ] 4.2.8 Delete empty `components/` directory

### 4.3 Migrate Page Routes

- [ ] 4.3.1 Move `dashboard/routes.tsx` (HTML rendering) to `web/pages/dashboard.tsx`
- [ ] 4.3.2 Move `auth/routes.tsx` (HTML rendering) to `web/pages/auth.tsx`
- [ ] 4.3.3 Move `projects/routes.tsx` (HTML rendering) to `web/pages/projects.tsx`
- [ ] 4.3.4 Move `sessions/routes.tsx` (HTML parts) to `web/pages/sessions.tsx`
- [ ] 4.3.5 Move `agents/routes.tsx` (HTML parts) to `web/pages/agents.tsx`
- [ ] 4.3.6 Move `credentials/routes.tsx` to `web/pages/credentials.tsx`
- [ ] 4.3.7 Move `mcp-servers/routes.tsx` (HTML parts) to `web/pages/mcp-servers.tsx`
- [ ] 4.3.8 Move `config/routes.tsx` (HTML parts) to `web/pages/config.tsx`

### 4.4 Update Frontend Imports

- [ ] 4.4.1 Update all imports in `web/pages/` to reference `web/components/` instead of `components/`
- [ ] 4.4.2 Update `web/pages/` to use `createInternalApiClient` for all backend communication
- [ ] 4.4.3 Ensure no direct imports from `domain/` exist in any `web/` file
- [ ] 4.4.4 Ensure no imports from `api/rest/` handlers exist in `web/` (only client types)

### 4.5 Frontend Layer Validation

- [ ] 4.5.1 Verify NO file under `web/` imports from `domain/`
- [ ] 4.5.2 Verify NO file under `web/` contains business logic (no repositories, no services)
- [ ] 4.5.3 Verify all backend communication goes through HTTP/API calls
- [ ] 4.5.4 Run tests to verify frontend layer is presentation-only
