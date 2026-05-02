## Why

The `web/` folder currently contains all frontend code in two flat directories: `components/` (28 files) and `pages/` (9 files). This makes it difficult to:
- Understand which components belong to which feature
- Navigate the codebase as it grows
- Delete or refactor a feature without hunting across folders
- Work on a feature without loading unrelated components into mental context

We need to organize frontend code by feature/domain so related components and pages are co-located.

## What Changes

- Reorganize `packages/mimo-platform/src/web/` into a feature-based structure
- Create `web/features/<domain>/` directories for each major domain:
  - sessions, projects, agents, auth, dashboard, credentials, mcp-servers, config, summary
- Each feature folder contains its own `pages/` and `components/` subdirectories
- Extract shared/cross-cutting components into `web/shared/components/`
- Move buffer components from `domain/buffers/` (which are UI components) to `web/features/sessions/components/buffers/`
- Update all imports throughout the codebase to reflect new paths

## Capabilities

### New Capabilities
- `frontend-feature-organization`: Establishes feature-based folder structure for all web frontend code

### Modified Capabilities
- *(None — pure reorganization with no behavior changes)*

## Impact

- All files under `packages/mimo-platform/src/web/` will be relocated
- `domain/buffers/*.tsx` files will move to `web/`
- Import paths in `web/pages/*`, `infrastructure/server/bootstrap.tsx`, and other files will change
- No user-facing changes — purely internal code organization
