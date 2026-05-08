## Context

Config routes handle loading, saving, and validating user configuration. The routes already have `/config/api` endpoints that will be migrated to the internal API.

## Goals / Non-Goals

**Goals:**

- Create internal API for config get/update/reset
- Migrate existing `/config/api` endpoints to internal API
- Refactor routes to proxy to internal API

**Non-Goals:**

- Changing ConfigService or configValidator
- New configuration options

## Decisions

### 1. Endpoint Mapping

- `GET /api/internal/config` → get current configuration
- `PUT /api/internal/config` → update configuration (validates first)
- `POST /api/internal/config/reset` → reset to defaults

### 2. Existing /config/api Migration

The existing `/config/api` endpoints will become simple redirects/proxies to internal API.

### 3. Validation Flow

Internal API validates config before saving using configValidator.

## Risks / Trade-offs

| Risk                                  | Mitigation                                           |
| ------------------------------------- | ---------------------------------------------------- |
| Breaking existing /config/api clients | Keep same response format, just change internal path |

## Migration Plan

1. Create internal API handlers
2. Create internal API routes
3. Refactor web routes (including existing API routes)
4. Update tests
5. Verify config editor still works
