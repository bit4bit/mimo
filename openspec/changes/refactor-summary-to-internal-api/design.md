## Context

Summary routes handle session summary generation by sending prompts to agents and retrieving generated summaries from chat history.

## Goals / Non-Goals

**Goals:**

- Create internal API for summary operations
- Refactor routes to proxy to internal API
- Keep agent coordination logic

**Non-Goals:**

- Changing summary generation mechanism
- New summary types

## Decisions

### 1. Endpoint Mapping

- `POST /api/internal/summary/refresh` → trigger summary generation
- `GET /api/internal/summary/latest` → get latest generated summary

### 2. Summary Generation Flow

Internal API receives request, validates session/agent, sends prompt to agent via WebSocket. Summary appears in chat history.

### 3. Agent Connection

Summary generation requires active agent connection - internal API returns error if agent not connected.

## Risks / Trade-offs

| Risk                     | Mitigation                                               |
| ------------------------ | -------------------------------------------------------- |
| Agent connection state   | Check connection before sending, return clear error      |
| Async summary generation | Return confirmation immediately, client polls for result |

## Migration Plan

1. Create internal API handlers
2. Create internal API routes
3. Refactor web routes to proxy
4. Update tests
5. Verify summary generation works
