## MODIFIED Requirements

### Requirement: User can delete a session

The system SHALL allow users to remove sessions. Every session delete path — the web `POST /sessions/:id/delete` route, the internal API `DELETE /api/internal/sessions/:id`, and the TTL sweeper — SHALL route through the shared `deleteSessionByRecord` use case so that MCP token revocation, session filesystem and centralized VCS repo removal, in-memory session/file-sync/impact state cleanup, and `session_ended` agent notification are performed on every path.

#### Scenario: Delete session with cleanup

- **WHEN** authenticated user deletes session "fix-auth-bug"
- **THEN** system revokes the session's MCP token
- **AND** system notifies every assigned agent (session-level and per-thread) via `session_ended`
- **AND** system removes the session directory including `upstream/`, `agent-workspace/`, and `patches/`
- **AND** system removes the centralized bare git repo under `~/.mimo/session-repos/`
- **AND** system clears in-memory session state, file-sync state, and impact state

#### Scenario: Internal API delete performs full cleanup

- **WHEN** a client calls `DELETE /api/internal/sessions/:id` for an owned session
- **THEN** the system runs the shared `deleteSessionByRecord` use case
- **AND** the MCP token is revoked and the assigned agent is notified
- **AND** the response is `{ success: true }`