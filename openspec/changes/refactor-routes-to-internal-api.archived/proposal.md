## Why

Currently, mimo-platform routes mix HTML rendering with direct service calls, tightly coupling the web layer to business logic. This prevents multiple frontends from consuming the same API and makes the system harder to test and maintain. We need to decouple the web interface from data operations.

## What Changes

This refactor is organized by domain. Each domain's HTML routes will become thin proxies that forward to an internal REST API:

### Projects Domain
- **New**: Internal API endpoints for CRUD operations (list, get, create, update, delete)
- **New**: Internal API for project sessions listing
- **Refactor**: `projects/routes.tsx` becomes proxy + JSX rendering
- **Routes affected**: `/projects`, `/projects/new`, `/projects/:id`, `/projects/:id/edit`, `/projects/:id/sessions`

### Sessions Domain
- **New**: Internal API endpoints for session CRUD and operations
- **New**: Internal API for chat history, thread management
- **Refactor**: `sessions/routes.tsx` becomes proxy + JSX rendering
- **Routes affected**: `/sessions`, `/sessions/new`, `/sessions/:id`, `/sessions/:id/chat`

### Agents Domain
- **New**: Internal API endpoints for agent CRUD and capability management
- **Refactor**: `agents/routes.tsx` becomes proxy + JSX rendering
- **Routes affected**: `/agents`, `/agents/new`, `/agents/:id`, `/agents/:id/capabilities`

### Dashboard Domain
- **New**: Internal API endpoint for dashboard data aggregation
- **Refactor**: `dashboard/routes.tsx` becomes proxy + JSX rendering
- **Routes affected**: `/dashboard`

### Credentials Domain
- **New**: Internal API endpoints for credential management
- **Refactor**: `credentials/routes.tsx` becomes proxy + JSX rendering
- **Routes affected**: `/credentials`, `/credentials/new`, `/credentials/:id`

### Config Domain
- **New**: Internal API endpoints for configuration management
- **Refactor**: `config/routes.tsx` becomes proxy + JSX rendering
- **Routes affected**: `/config`

### MCP Servers Domain
- **New**: Internal API endpoints for MCP server management
- **Refactor**: `mcp-servers/routes.tsx` becomes proxy + JSX rendering
- **Routes affected**: `/mcp-servers`, `/mcp-servers/new`, `/mcp-servers/:id`

### Summary Domain
- **New**: Internal API endpoints for session summaries
- **Refactor**: `summary/routes.tsx` becomes proxy + JSX rendering
- **Routes affected**: `/summary`, `/summary/:sessionId`

### Auth Domain
- **New**: Internal API endpoints for authentication operations
- **Refactor**: `auth/routes.tsx` becomes proxy + JSX rendering (login form)
- **Routes affected**: `/auth/login`, `/auth/logout`

### Infrastructure
- **New**: `/api/internal/*` router with standardized request/response handling
- **New**: JWT token forwarding from web layer to internal API
- **Unchanged**: API-only routes (files, commits, auto-commit, sync) remain as-is

## Capabilities

### New Capabilities
- `internal-api-projects`: Internal REST API for project management operations
- `internal-api-sessions`: Internal REST API for session management operations
- `internal-api-agents`: Internal REST API for agent management operations
- `internal-api-dashboard`: Internal REST API for dashboard data aggregation
- `internal-api-credentials`: Internal REST API for credential management
- `internal-api-config`: Internal REST API for configuration management
- `internal-api-mcp-servers`: Internal REST API for MCP server management
- `internal-api-summary`: Internal REST API for session summaries
- `internal-api-auth`: Internal REST API for authentication operations
- `internal-api-infrastructure`: Core internal API infrastructure (routing, auth forwarding, response formatting)

### Modified Capabilities
<!-- This is implementation refactoring. No spec-level requirements change - routes continue to work as before. -->

## Impact

- **Routes being refactored**: All `.tsx` routes (projects, sessions, agents, dashboard, credentials, config, mcp-servers, summary, auth)
- **Routes unchanged**: All `.ts` routes (files, commits, auto-commit, sync) - already API-only
- **Services**: No changes to existing services - they will be called by internal API handlers
- **Tests**: Route tests need updates to mock HTTP calls instead of direct service calls
- **Auth**: JWT tokens flow from web layer → internal API, validated at both layers
