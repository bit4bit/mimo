## Context

Session creation captures several optional inputs (`assignedAgentId`, `agentSubpath`, `branchName`, `mcpServerIds`) and stores normalized values on the session entity. The settings page currently renders idle timeout controls and ACP status, but does not expose creation-time configuration in a user-facing way.

## Goals / Non-Goals

**Goals:**
- Show creation-time session configuration in a read-only section on settings page.
- Reuse persisted session data; avoid adding new storage.
- Provide explicit fallback labels when optional values are empty.

**Non-Goals:**
- Editing creation fields from settings page.
- Changing session creation behavior or validation logic.
- Changing idle-timeout update behavior.

## Decisions

### D1: Keep page split between creation and runtime settings

**Decision**: Add a dedicated "Creation Settings" section above existing timeout controls, and retain timeout update as a separate runtime section.

**Rationale**: This keeps intent clear: creation metadata is historical/read-only, while timeout remains operational/editable.

### D2: Resolve display data in route

**Decision**: `GET /sessions/:id/settings` resolves related display names (assigned agent and MCP server names) and passes plain values into the component.

**Rationale**: Keeps `SessionSettingsPage` presentational and avoids data fetching in view logic.

### D3: Standardized fallback labels for empty values

**Decision**: Use deterministic fallback labels:
- Assigned Agent: `None`
- Agent working directory: `Repository root`
- Branch: `Not set`
- MCP Servers: `None attached`

**Rationale**: Avoids blank UI and creates predictable behavior for tests.

## Risks / Trade-offs

- If an assigned agent or MCP server is deleted later, the settings page can only show available data. Mitigation: display fallback labels instead of failing render.
