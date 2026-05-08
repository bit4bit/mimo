## Context

Agents routes handle agent management and capabilities. Creating an internal API enables reuse.

## Goals / Non-Goals

**Goals:**

- Create internal API for agent CRUD
- Create endpoints for capabilities management
- Refactor routes to proxy

**Non-Goals:**

- Changing AgentService implementation
- Agent token generation logic

## Decisions

### 1. Endpoint Mapping

- `GET /api/internal/agents` → list agents
- `GET /api/internal/agents/:id` → get agent
- `POST /api/internal/agents` → create agent
- `PUT /api/internal/agents/:id` → update agent
- `DELETE /api/internal/agents/:id` → delete agent
- `GET /api/internal/agents/:id/capabilities` → get capabilities
- `POST /api/internal/agents/:id/capabilities/refresh` → refresh capabilities

### 2. Agent Token Endpoints

The `/api/internal/agents/me/sessions` endpoint (for agents) stays separate - it validates agent tokens, not user tokens.

## Risks / Trade-offs

| Risk                     | Mitigation                                        |
| ------------------------ | ------------------------------------------------- |
| Dual auth (user + agent) | Keep agent endpoints separate with different auth |
| Capability refresh async | API triggers refresh, returns status              |

## Migration Plan

1. Create internal API handlers
2. Create internal API routes
3. Refactor web routes
4. Update tests
5. Verify agent authentication still works
