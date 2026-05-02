## 1. Create Directory Structure

- [x] 1.1 Create `web/features/` with subdirectories:
  - `web/features/agents/`
  - `web/features/auth/`
  - `web/features/config/`
  - `web/features/credentials/`
  - `web/features/dashboard/`
  - `web/features/mcp-servers/`
  - `web/features/projects/`
  - `web/features/sessions/`
  - `web/features/summary/`
- [x] 1.2 Create `pages/` and `components/` inside each feature directory
- [x] 1.3 Create `web/shared/components/` for cross-cutting components
- [x] 1.4 Create `web/features/sessions/components/buffers/` for buffer components

## 2. Move Page Routes

- [x] 2.1 Move `web/pages/agents.tsx` → `web/features/agents/pages/agents.tsx`
- [x] 2.2 Move `web/pages/auth.tsx` → `web/features/auth/pages/auth.tsx`
- [x] 2.3 Move `web/pages/config.tsx` → `web/features/config/pages/config.tsx`
- [x] 2.4 Move `web/pages/credentials.tsx` → `web/features/credentials/pages/credentials.tsx`
- [x] 2.5 Move `web/pages/dashboard.tsx` → `web/features/dashboard/pages/dashboard.tsx`
- [x] 2.6 Move `web/pages/mcp-servers.tsx` → `web/features/mcp-servers/pages/mcp-servers.tsx`
- [x] 2.7 Move `web/pages/projects.tsx` → `web/features/projects/pages/projects.tsx`
- [x] 2.8 Move `web/pages/sessions.tsx` → `web/features/sessions/pages/sessions.tsx`
- [x] 2.9 Move `web/pages/summary.tsx` → `web/features/summary/pages/summary.tsx`
- [x] 2.10 Delete empty `web/pages/` directory

## 3. Move Feature-Specific Components

### Sessions Feature
- [x] 3.1 Move `web/components/SessionDetailPage.tsx` → `web/features/sessions/components/SessionDetailPage.tsx`
- [x] 3.2 Move `web/components/SessionCreatePage.tsx` → `web/features/sessions/components/SessionCreatePage.tsx`
- [x] 3.3 Move `web/components/SessionSettingsPage.tsx` → `web/features/sessions/components/SessionSettingsPage.tsx`
- [x] 3.4 Move `web/components/SessionList.tsx` → `web/features/sessions/components/SessionList.tsx`
- [x] 3.5 Move `web/components/SessionFinderDialog.tsx` → `web/features/sessions/components/SessionFinderDialog.tsx`
- [x] 3.6 Move `web/components/SummaryBuffer.tsx` → `web/features/sessions/components/SummaryBuffer.tsx`
- [x] 3.7 Move `web/components/ImpactBuffer.tsx` → `web/features/sessions/components/ImpactBuffer.tsx`

### Projects Feature
- [x] 3.8 Move `web/components/ProjectsSessionsPage.tsx` → `web/features/projects/components/ProjectsSessionsPage.tsx`
- [x] 3.9 Move `web/components/ProjectCreatePage.tsx` → `web/features/projects/components/ProjectCreatePage.tsx`
- [x] 3.10 Move `web/components/ProjectEditPage.tsx` → `web/features/projects/components/ProjectEditPage.tsx`
- [x] 3.11 Move `web/components/ImpactHistoryPage.tsx` → `web/features/projects/components/ImpactHistoryPage.tsx`

### Auth Feature
- [x] 3.12 Move `web/components/LoginPage.tsx` → `web/features/auth/components/LoginPage.tsx`
- [x] 3.13 Move `web/components/RegisterPage.tsx` → `web/features/auth/components/RegisterPage.tsx`

### Dashboard Feature
- [x] 3.14 Move `web/components/DashboardPage.tsx` → `web/features/dashboard/components/DashboardPage.tsx`
- [x] 3.15 Move `web/components/LandingPage.tsx` → `web/features/dashboard/components/LandingPage.tsx`

### Credentials Feature
- [x] 3.16 Move `web/components/CredentialsListPage.tsx` → `web/features/credentials/components/CredentialsListPage.tsx`
- [x] 3.17 Move `web/components/CredentialCreatePage.tsx` → `web/features/credentials/components/CredentialCreatePage.tsx`
- [x] 3.18 Move `web/components/CredentialEditPage.tsx` → `web/features/credentials/components/CredentialEditPage.tsx`

### MCP Servers Feature
- [x] 3.19 Move `web/components/McpServerListPage.tsx` → `web/features/mcp-servers/components/McpServerListPage.tsx`
- [x] 3.20 Move `web/components/McpServerFormPage.tsx` → `web/features/mcp-servers/components/McpServerFormPage.tsx`

### Config Feature
- [x] 3.21 Move `web/components/ConfigEditorPage.tsx` → `web/features/config/components/ConfigEditorPage.tsx`

### Agents Feature
- [x] 3.22 Move `web/components/DataTable.tsx` → `web/features/agents/components/DataTable.tsx`

## 4. Move Shared Components

- [x] 4.1 Move `web/components/Layout.tsx` → `web/shared/components/Layout.tsx`
- [x] 4.2 Move `web/components/Frame.tsx` → `web/shared/components/Frame.tsx`
- [x] 4.3 Move `web/components/FileFinderDialog.tsx` → `web/shared/components/FileFinderDialog.tsx`
- [x] 4.4 Move `web/components/ContentFinderDialog.tsx` → `web/shared/components/ContentFinderDialog.tsx`

## 5. Move Buffer Components from Domain

- [x] 5.1 Move `domain/buffers/ChatBuffer.tsx` → `web/features/sessions/components/buffers/ChatBuffer.tsx`
- [x] 5.2 Move `domain/buffers/ChatThreadsBuffer.tsx` → `web/features/sessions/components/buffers/ChatThreadsBuffer.tsx`
- [x] 5.3 Move `domain/buffers/EditBuffer.tsx` → `web/features/sessions/components/buffers/EditBuffer.tsx`
- [x] 5.4 Move `domain/buffers/McpServersBuffer.tsx` → `web/features/sessions/components/buffers/McpServersBuffer.tsx`
- [x] 5.5 Move `domain/buffers/NotesBuffer.tsx` → `web/features/sessions/components/buffers/NotesBuffer.tsx`
- [x] 5.6 Move `domain/buffers/PatchBuffer.tsx` → `web/features/sessions/components/buffers/PatchBuffer.tsx`
- [x] 5.7 Move `domain/buffers/index.ts` → `web/features/sessions/components/buffers/index.ts`
- [x] 5.8 Move `domain/buffers/registry.ts` → `web/features/sessions/components/buffers/registry.ts`
- [x] 5.9 Move `domain/buffers/types.ts` → `web/features/sessions/components/buffers/types.ts`
- [x] 5.10 Delete empty `domain/buffers/` directory

## 6. Update Imports

- [x] 6.1 Update `infrastructure/server/bootstrap.tsx` to import from new feature paths
- [x] 6.2 Update all `web/features/*/pages/*.tsx` to import from correct relative paths
- [x] 6.3 Update all `web/features/*/components/*.tsx` to import from correct relative paths
- [x] 6.4 Update `domain/sessions/frame-state.ts` or other domain files that reference buffers
- [x] 6.5 Update any other files importing from `web/components/` or `domain/buffers/`

## 7. Validation

- [x] 7.1 Verify no files remain in `web/pages/` or `web/components/`
- [x] 7.2 Verify no TSX files remain in `domain/`
- [x] 7.3 Verify all imports resolve correctly (no broken paths)
- [x] 7.4 Run `bun test` in packages/mimo-platform - **883 pass, 0 fail**
- [x] 7.5 Run `bun run test.full` for integration tests - Fixed import path in fossil-credentials.test.ts
- [x] 7.6 Verify application builds with `bun build`
