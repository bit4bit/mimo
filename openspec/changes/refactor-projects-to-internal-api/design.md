## Context

Projects routes currently mix HTML rendering with direct service calls. This refactor moves business logic to an internal API.

## Goals / Non-Goals

**Goals:**

- Create internal API for projects CRUD
- Refactor routes to proxy to internal API
- Keep all existing functionality

**Non-Goals:**

- Changing service implementations
- New features
- Breaking changes

## Decisions

### 1. Endpoint Mapping

- `GET /api/internal/projects` → list projects
- `GET /api/internal/projects/:id` → get project
- `POST /api/internal/projects` → create project
- `PUT /api/internal/projects/:id` → update project
- `DELETE /api/internal/projects/:id` → delete project
- `GET /api/internal/projects/:id/sessions` → list project sessions

### 2. Proxy Pattern

Web routes will:

1. Extract token from cookie/header
2. Make HTTP request to internal API
3. Parse JSON response
4. Render JSX with response data

## Risks / Trade-offs

| Risk                 | Mitigation                                            |
| -------------------- | ----------------------------------------------------- |
| Performance overhead | HTTP loopback is fast, can optimize later if needed   |
| Route complexity     | Keep proxy logic minimal, extract to helper if needed |

## Migration Plan

1. Create internal API handlers
2. Create internal API routes
3. Refactor web routes to proxy
4. Update tests
5. Verify all endpoints
