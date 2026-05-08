## Why

The mimo-platform codebase has mixed responsibilities at the folder level. Domain logic (services, repositories), API controllers, and frontend page rendering are all co-located in the same `src/` directories. This makes it difficult to understand which code belongs to which architectural layer, complicates testing, and increases the risk of frontend code directly coupling to business logic.

We need to establish a clean layered architecture that separates domain logic, API transport, and frontend presentation while keeping related domain code discoverable.

## What Changes

- **BREAKING** Reorganize `packages/mimo-platform/src/` into four distinct layers: `domain/`, `api/`, `web/`, and `infrastructure/`
- Move all services and repositories from feature folders (`agents/`, `sessions/`, `projects/`, etc.) into `domain/<feature>/`
- Move all REST API controllers from `api/internal/` and JSON route files into `api/rest/`
- Move all HTML/JSX page routes and shared UI components into `web/`
- Move server bootstrap, DI context, and OS adapters into `infrastructure/`
- Eliminate the parallel `api/internal/` structure by merging internal APIs into domain-specific API files
- Preserve all existing functionality — this is a pure code reorganization with no behavior changes

## Capabilities

### New Capabilities

- `layered-architecture`: Establishes the four-layer folder structure and dependency rules (domain → api → web, with infrastructure supporting all layers)

### Modified Capabilities

- _(None — this refactoring preserves all existing requirements. No user-facing behavior changes.)_

## Impact

- All files under `packages/mimo-platform/src/` will be relocated
- Import paths throughout the codebase will change to reflect new locations
- The `api/internal/` directory will be removed (merged into `api/rest/`)
- The `components/` directory will move to `web/components/`
- The `context/` and `server/` directories will move to `infrastructure/`
- No API contract changes — all endpoints, WebSocket handlers, and page routes remain functionally identical
