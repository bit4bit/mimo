## Domain Layer Tasks

### 2.1 Create Domain Structure

- [ ] 2.1.1 Create `domain/` directory with feature subdirectories:
  - `domain/agents/`
  - `domain/sessions/`
  - `domain/projects/`
  - `domain/auth/`
  - `domain/credentials/`
  - `domain/mcp-servers/`
  - `domain/impact/`
  - `domain/commits/`
  - `domain/sync/`
  - `domain/files/`
  - `domain/auto-commit/`
  - `domain/config/`
  - `domain/vcs/`

### 2.2 Migrate Agents Domain

- [ ] 2.2.1 Move `agents/service.ts` to `domain/agents/service.ts`
- [ ] 2.2.2 Move `agents/repository.ts` to `domain/agents/repository.ts`
- [ ] 2.2.3 Move `agents/message-router.ts` to `domain/agents/message-router.ts`
- [ ] 2.2.4 Update all imports referencing agents domain files
- [ ] 2.2.5 Verify `domain/agents/` contains ONLY business logic (no JSX, no HTTP handlers)

### 2.3 Migrate Sessions Domain

- [ ] 2.3.1 Move `sessions/chat.ts` to `domain/sessions/chat.ts`
- [ ] 2.3.2 Move `sessions/repository.ts` to `domain/sessions/repository.ts`
- [ ] 2.3.3 Move `sessions/frame-state.ts` to `domain/sessions/frame-state.ts`
- [ ] 2.3.4 Move `sessions/state.ts` to `domain/sessions/state.ts`
- [ ] 2.3.5 Move `sessions/session-deletion.ts` to `domain/sessions/session-deletion.ts`
- [ ] 2.3.6 Move `sessions/session-retention.ts` to `domain/sessions/session-retention.ts`
- [ ] 2.3.7 Move `sessions/streaming-pipeline.ts` to `domain/sessions/streaming-pipeline.ts`
- [ ] 2.3.8 Update all imports referencing sessions domain files
- [ ] 2.3.9 Verify `domain/sessions/` contains ONLY business logic

### 2.4 Migrate Projects Domain

- [ ] 2.4.1 Move `projects/repository.ts` to `domain/projects/repository.ts`
- [ ] 2.4.2 Check if `projects/` has any business logic beyond repository
- [ ] 2.4.3 Update all imports referencing projects domain files

### 2.5 Migrate Auth Domain

- [ ] 2.5.1 Move `auth/jwt.ts` to `domain/auth/jwt.ts`
- [ ] 2.5.2 Move `auth/user.ts` (repository) to `domain/auth/repository.ts`
- [ ] 2.5.3 Move `auth/service.ts` (if exists) to `domain/auth/service.ts`
- [ ] 2.5.4 Update all imports referencing auth domain files

### 2.6 Migrate Remaining Domains

- [ ] 2.6.1 Move `credentials/repository.ts` and `credentials/service.ts` to `domain/credentials/`
- [ ] 2.6.2 Move `mcp-servers/repository.ts` and `mcp-servers/service.ts` to `domain/mcp-servers/`
- [ ] 2.6.3 Move `impact/` business logic to `domain/impact/`
- [ ] 2.6.4 Move `commits/service.ts` to `domain/commits/`
- [ ] 2.6.5 Move `sync/service.ts` to `domain/sync/`
- [ ] 2.6.6 Move `files/` business logic (service, expert-service, search-service) to `domain/files/`
- [ ] 2.6.7 Move `auto-commit/service.ts` to `domain/auto-commit/`
- [ ] 2.6.8 Move `config/service.ts` to `domain/config/`
- [ ] 2.6.9 Move `vcs/` business logic to `domain/vcs/`

### 2.7 Domain Layer Validation

- [ ] 2.7.1 Verify NO file under `domain/` imports from `api/`, `web/`, or `infrastructure/server/`
- [ ] 2.7.2 Verify NO file under `domain/` contains JSX/TSX
- [ ] 2.7.3 Verify NO file under `domain/` contains HTTP route handlers
- [ ] 2.7.4 Run tests to verify domain layer is pure business logic
