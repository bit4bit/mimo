## Context

The current `web/` structure:

```
web/
├── components/          ← 28 files mixed together
│   ├── Layout.tsx       ← shared
│   ├── DataTable.tsx    ← shared
│   ├── DashboardPage.tsx   ← dashboard-specific
│   ├── SessionDetailPage.tsx  ← sessions-specific
│   ├── LoginPage.tsx     ← auth-specific
│   └── ... (23 more)
└── pages/               ← 9 route files
    ├── agents.tsx
    ├── auth.tsx
    ├── dashboard.tsx
    └── ... (6 more)
```

Additionally, `domain/buffers/*.tsx` contains UI buffer components that render HTML but live in the domain layer, violating separation of concerns.

## Goals / Non-Goals

**Goals:**

- Group all frontend code by feature/domain
- Make it obvious where to find and add feature-specific UI code
- Extract truly shared components into a clear location
- Move UI components out of `domain/` layer
- Preserve all existing functionality

**Non-Goals:**

- No changes to component logic or behavior
- No changes to API contracts or routes
- No renaming of components (only relocation)
- No changes to build process or bundling

## Decisions

### Decision 1: Feature-based over type-based organization

**Rationale**: Option 1 (feature-based) was chosen because:

- Related code stays together (easier to navigate)
- Features can be understood in isolation
- Deleting a feature means deleting one folder
- Aligns with how developers think about the product ("I need to work on sessions")

### Decision 2: Each feature has `pages/` and `components/` subfolders

**Rationale**: Maintains the existing mental model of pages vs components, but scoped to the feature. A feature may have multiple pages (e.g., sessions has list, detail, create, settings) and many components.

### Decision 3: `shared/` for cross-cutting concerns

**Rationale**: Layout, Frame, DataTable, and dialogs are used by multiple features. Extracting them prevents duplication and makes shared dependencies explicit. Dialogs are shared because they appear in multiple contexts (file finder, content finder, session finder).

### Decision 4: Buffers move from `domain/` to `web/features/sessions/components/buffers/`

**Rationale**: Buffer components (`ChatBuffer`, `ImpactBuffer`, etc.) are pure UI components that render HTML. They don't contain business logic. Moving them to web layer enforces the rule that `domain/` contains no JSX.

## Risks / Trade-offs

**[Risk] Deeper nesting increases import path length** → **Mitigation**: Import paths go from `../../components/SessionDetailPage` to `../../features/sessions/components/SessionDetailPage` — slightly longer but more descriptive. Acceptable trade-off.

**[Risk] Shared components may be harder to discover** → **Mitigation**: Keep `shared/` at top level of `web/` with clear naming. Developers learn quickly that shared = `web/shared/`.

**[Risk] Feature boundaries may blur over time** → **Mitigation**: Document the rule: if a component is used by 2+ features, it goes in `shared/`. Periodic code reviews enforce this.

## Migration Plan

1. Create new directory structure under `web/features/`
2. Move page route files from `web/pages/` to `web/features/<domain>/pages/`
3. Move component files from `web/components/` to `web/features/<domain>/components/`
4. Move shared components to `web/shared/components/`
5. Move buffer components from `domain/buffers/` to `web/features/sessions/components/buffers/`
6. Update all import statements
7. Delete old empty directories
8. Run tests

## Open Questions

1. Should `LandingPage.tsx` go in `web/features/dashboard/` or `web/shared/`? → **Decision**: `web/features/dashboard/` since it's the dashboard/entry feature.
2. Should dialogs be in `shared/components/dialogs/` or flat in `shared/components/`? → **Decision**: Flat for now, group if count grows beyond 5.
