## Context

Dashboard is a simple aggregation page. The refactor creates a single endpoint that returns all needed data.

## Goals / Non-Goals

**Goals:**
- Create single internal API endpoint for dashboard data
- Refactor dashboard route to proxy

**Non-Goals:**
- Changing aggregation logic
- Adding new dashboard features

## Decisions

### 1. Endpoint Mapping
- `GET /api/internal/dashboard` → returns `{ projects, agents, recentSessions, stats }`

### 2. Response Format
Single aggregation response with all data needed by DashboardPage component.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Large response | Same data as before, just structured differently |

## Migration Plan

1. Create internal API handler
2. Create internal API route
3. Refactor dashboard route
4. Update tests
5. Verify dashboard renders correctly
