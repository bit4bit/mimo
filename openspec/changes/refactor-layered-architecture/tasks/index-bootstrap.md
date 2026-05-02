## Root Index and Bootstrap Tasks

### 5.1 Refactor Entry Point

- [ ] 5.1.1 Create `infrastructure/server/bootstrap.ts` with server setup logic
- [ ] 5.1.2 Extract DI container initialization from `index.tsx` to `infrastructure/context/bootstrap.ts`
- [ ] 5.1.3 Create `api/rest/routes.ts` that composes all REST API routes
- [ ] 5.1.4 Create `web/routes.ts` that composes all page routes

### 5.2 Simplify index.tsx

- [ ] 5.2.1 Remove all WebSocket handler logic from `index.tsx`
- [ ] 5.2.2 Remove all route definitions from `index.tsx`
- [ ] 5.2.3 Remove all service initialization from `index.tsx`
- [ ] 5.2.4 Keep only: environment validation, bootstrap calls, server start
- [ ] 5.2.5 Ensure `index.tsx` imports from `infrastructure/`, `api/`, and `web/` only

### 5.3 Cross-Cutting Concerns

- [ ] 5.3.1 Move `logger.ts` to `infrastructure/logger.ts`
- [ ] 5.3.2 Update `index.tsx` to use new logger location
- [ ] 5.3.3 Ensure static file serving is configured in `infrastructure/server/` or `api/rest/`

### 5.4 Final Integration

- [ ] 5.4.1 Wire together all layers in correct order: infrastructure → domain → api → web
- [ ] 5.4.2 Verify application starts successfully
- [ ] 5.4.3 Run full test suite
