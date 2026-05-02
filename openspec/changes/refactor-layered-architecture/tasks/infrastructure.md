## Infrastructure Layer Tasks

### 1.1 Create Infrastructure Structure

- [ ] 1.1.1 Create `infrastructure/` directory structure:
  - `infrastructure/server/`
  - `infrastructure/context/`
  - `infrastructure/os/`
  - `infrastructure/db/` (if needed for future database abstractions)

### 1.2 Migrate Server Infrastructure

- [ ] 1.2.1 Move `server/mimo-server.ts` to `infrastructure/server/mimo-server.ts`
- [ ] 1.2.2 Move `assets.ts` to `infrastructure/server/assets.ts`
- [ ] 1.2.3 Update all imports referencing `server/mimo-server.ts`

### 1.3 Migrate Context/DI

- [ ] 1.3.1 Move `context/mimo-context.ts` to `infrastructure/context/mimo-context.ts`
- [ ] 1.3.2 Update all imports referencing `context/mimo-context.ts`

### 1.4 Migrate OS Adapter

- [ ] 1.4.1 Move `os/node-adapter.ts` to `infrastructure/os/node-adapter.ts`
- [ ] 1.4.2 Move `os/types.ts` to `infrastructure/os/types.ts`
- [ ] 1.4.3 Update all imports referencing `os/` files

### 1.5 Infrastructure Validation

- [ ] 1.5.1 Verify `infrastructure/` has NO imports from `domain/`, `api/`, or `web/`
- [ ] 1.5.2 Verify `infrastructure/` contains only system-level concerns
- [ ] 1.5.3 Run tests to verify infrastructure layer migration
