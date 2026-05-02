## Context

The mimo-platform `src/` directory currently mixes three architectural concerns in a single flat structure:

1. **Domain logic**: Services (e.g., `agents/service.ts`) and repositories (e.g., `agents/repository.ts`) that encapsulate business rules and data access
2. **API transport**: REST controllers under `api/internal/` and JSON route files (e.g., `sync/routes.ts`) that handle HTTP concerns
3. **Frontend presentation**: JSX page components under `components/` and HTML-rendering routes (e.g., `dashboard/routes.tsx`) that generate UI

Additionally, infrastructure concerns like server bootstrap (`server/mimo-server.ts`), dependency injection (`context/mimo-context.ts`), and OS abstractions (`os/`) are scattered throughout.

This co-location makes it impossible to answer "where is the business logic?" without searching across multiple folders. It also encourages direct imports from page routes into repositories, bypassing the API layer entirely.

## Goals / Non-Goals

**Goals:**
- Establish a strict four-layer architecture: Domain → API → Web, supported by Infrastructure
- Ensure each layer has a single, well-defined responsibility
- Make business logic discoverable and testable in isolation
- Eliminate the parallel `api/internal/` structure by merging it into the API layer
- Keep all files related to a domain feature within a clear layer boundary

**Non-Goals:**
- No behavioral changes to any endpoint, page, or WebSocket handler
- No changes to external API contracts or database schemas
- No new features or capabilities beyond the structural reorganization
- No introduction of new frameworks or dependencies

## Decisions

### Decision 1: Four-layer structure over three-layer
**Rationale**: We evaluated a three-layer approach (combine API + Infrastructure), but the DI context and server bootstrap are fundamentally different from API controllers. Infrastructure code has no HTTP knowledge, while API code is entirely HTTP-centric. Separating them prevents circular dependencies and makes testing easier.

### Decision 2: Merge `api/internal/` into `api/rest/` rather than keep parallel structures
**Rationale**: The `api/internal/` directory exists because it uses JWT Bearer token auth instead of cookie auth. However, both serve the same purpose: JSON REST APIs. Instead of maintaining two parallel API hierarchies, we unify them under `api/rest/` with sub-folders or naming conventions for auth variants. This reduces cognitive load.

### Decision 3: Move `components/` to `web/components/` and `*/routes.tsx` (HTML) to `web/pages/`
**Rationale**: The current `components/` folder contains full page components (e.g., `DashboardPage.tsx`) and shared UI primitives (e.g., `DataTable.tsx`). Moving all frontend code to `web/` establishes a clear presentation layer boundary. Pages become route handlers; shared components become reusable UI.

### Decision 4: Keep domain services and repositories in the same `domain/` subfolder
**Rationale**: Services and repositories are tightly coupled — services depend on repositories. Separating them into `services/` and `repositories/` folders would fragment domain logic and make navigation harder. Co-locating them in `domain/<feature>/` preserves the "related code together" principle.

### Decision 5: Preserve existing file names during migration
**Rationale**: Renaming files adds cognitive overhead during code review. We move files first, then optionally rename in follow-up changes. This makes the diff focused on location changes rather than content + location changes.

## Risks / Trade-offs

**[Risk] Large diff makes review difficult** → **Mitigation**: Staged migration — move one domain at a time (agents, then sessions, then projects, etc.). Each stage is a separate commit.

**[Risk] Import path churn breaks existing work in progress** → **Mitigation**: Coordinate with team to merge this change during a low-activity period. Use find/replace for import updates.

**[Risk] `index.tsx` remains a coordinator with mixed concerns** → **Mitigation**: After the domain/api/web migration, extract the WebSocket handlers from `index.tsx` into `api/websocket/` and the server bootstrap into `infrastructure/server/index.ts`.

**[Risk] Tests may have hardcoded paths** → **Mitigation**: Run full test suite after each stage. Update test imports alongside source imports.

**[Trade-off] More nesting vs. flat structure** → The new structure has deeper nesting (e.g., `domain/agents/service.ts` vs `agents/service.ts`). This is accepted because the clarity of layer boundaries outweighs the extra directory depth.

## Migration Plan

1. **Stage 1**: Move `context/` and `server/` to `infrastructure/`, update imports
2. **Stage 2**: Move all domain services/repositories to `domain/`, update imports
3. **Stage 3**: Move `api/internal/` to `api/rest/`, merge with existing JSON routes, update imports
4. **Stage 4**: Move `components/` and HTML page routes to `web/`, update imports
5. **Stage 5**: Refactor `index.tsx` to delegate to layer entry points
6. **Stage 6**: Run full test suite and fix any broken imports

Rollback: Revert the git commits for each stage.

## Open Questions

1. Should `web/pages/` use the domain name (e.g., `agents-pages.tsx`) or keep current names (`routes.tsx`)?
2. Should we introduce barrel exports (`domain/agents/index.ts`) to simplify imports, or keep direct deep imports?
3. How do we handle the `assets.ts` file — is it infrastructure or web?
