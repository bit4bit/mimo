## ADDED Requirements

### Requirement: Project delete cascades through all sessions

The system SHALL, when deleting a project, delete every session owned by that project using the shared session-deletion use case before removing the project directory. Per-session cleanup SHALL revoke the session's MCP token, remove the session filesystem and its centralized bare VCS repo, clear in-memory session/file-sync/impact state, and notify every assigned agent (session-level and per-thread) via `session_ended`.

#### Scenario: Delete project deletes all its sessions

- **WHEN** an authenticated owner deletes a project that has 3 sessions
- **THEN** the system deletes all 3 sessions via the shared session-deletion use case
- **AND** each session's `session.yaml`, `upstream/`, `agent-workspace/`, and `patches/` directories are removed
- **AND** each session's centralized bare git repo under `~/.mimo/session-repos/` is removed

#### Scenario: Delete project revokes MCP tokens for its sessions

- **WHEN** an authenticated owner deletes a project whose sessions have MCP tokens
- **THEN** the system revokes each session's MCP token before removing the session filesystem

#### Scenario: Delete project clears in-memory session state

- **WHEN** an authenticated owner deletes a project
- **THEN** the system clears session state, file-sync state, and impact state for every session of the project

#### Scenario: Delete project with no sessions

- **WHEN** an authenticated owner deletes a project that has 0 sessions
- **THEN** the system skips session cleanup
- **AND** the system removes the project directory and VCS cache

#### Scenario: Per-session cleanup error does not block project delete

- **WHEN** one session fails to delete during a project delete (e.g. corrupt `session.yaml`)
- **THEN** the system logs the error and continues deleting the remaining sessions
- **AND** the system still removes the project directory and VCS cache

### Requirement: Project delete disconnects active agents

The system SHALL notify every agent connected to a deleted project's sessions via `session_ended` so the agent tears down its ACP processes for those sessions. In-flight prompts SHALL NOT be cancelled; the notification only ends the session on the agent side.

#### Scenario: Active agent on a deleted session is notified

- **GIVEN** a project has a session with an online agent assigned at the session level
- **WHEN** the owner deletes the project
- **THEN** the system sends `session_ended` for that session to the assigned agent
- **AND** the agent tears down its ACP clients for that session

#### Scenario: Agents assigned per chat thread are notified

- **GIVEN** a session has two chat threads, each assigned to a different agent
- **WHEN** the owner deletes the project
- **THEN** the system sends `session_ended` for that session to both agents
- **AND** each agent tears down its ACP clients for that session

#### Scenario: Offline agent receives no notification but session is still removed

- **GIVEN** a session's assigned agent is offline (no open WebSocket)
- **WHEN** the owner deletes the project
- **THEN** the system attempts `session_ended` (no-op without a connection)
- **AND** the session filesystem and centralized repo are still removed

### Requirement: Project delete removes stale pinned-session references

The system SHALL remove pinned-session entries for each deleted session id belonging to the project owner when a project is deleted.

#### Scenario: Pinned sessions for a deleted project are unpinned

- **GIVEN** the owner has pinned two sessions of a project
- **WHEN** the owner deletes the project
- **THEN** the system removes both pinned-session entries from the owner's `pinned-sessions.yaml`
- **AND** the pinned-sessions list no longer references those session ids

#### Scenario: Pinned sessions for other projects are untouched

- **GIVEN** the owner has pinned a session of another project
- **WHEN** the owner deletes a different project
- **THEN** the pinned entry for the other project's session remains

### Requirement: Project delete removes project VCS cache and directory

The system SHALL clear the project's VCS cache (git and fossil) and remove the project directory (including `project.yaml`, `features.json`, and `impacts/`) after all sessions are deleted.

#### Scenario: VCS cache cleared on project delete

- **WHEN** an authenticated owner deletes a project
- **THEN** the system clears the project's git VCS cache
- **AND** the system clears the project's fossil VCS cache

#### Scenario: Project directory removed on project delete

- **WHEN** an authenticated owner deletes a project
- **THEN** the system removes the project directory at `~/.mimo/projects/<projectId>/` recursively
- **AND** `project.yaml`, `features.json`, and the `impacts/` directory no longer exist

### Requirement: Project delete use case is the single cleanup entry point

The system SHALL route both `DELETE /api/internal/projects/:id` and the web `POST /projects/:id/delete` action through the same project-deletion use case. No project delete path SHALL bypass session cascade cleanup, agent notification, pinned-reference cleanup, or VCS-cache clearing.

#### Scenario: Internal API delete runs full cascade

- **WHEN** a client calls `DELETE /api/internal/projects/:id` for an owned project
- **THEN** the system runs the project-deletion use case (session cascade + pins + cache + dir)
- **AND** the response is `{ success: true }`

#### Scenario: Web delete runs full cascade and redirects

- **WHEN** the owner submits `POST /projects/:id/delete`
- **THEN** the system runs the project-deletion use case
- **AND** the response redirects to `/projects`

### Requirement: Project delete is owner-gated

The system SHALL reject project deletion for any user who is not the project owner.

#### Scenario: Non-owner cannot delete project

- **WHEN** a user who is not the project owner calls `DELETE /api/internal/projects/:id`
- **THEN** the system returns `404`
- **AND** the project and its sessions are unchanged

#### Scenario: Unauthenticated user cannot delete project

- **WHEN** an unauthenticated client calls `DELETE /api/internal/projects/:id`
- **THEN** the system returns `401`
- **AND** no deletion occurs

### Requirement: Project edit page exposes a confirmed delete action

The system SHALL render a "Delete project" control on the project edit page. Activating it SHALL require a confirmation step that states the project name and the number of sessions and active agents that will be removed before the delete is submitted.

#### Scenario: Delete project button is shown on the edit page

- **WHEN** the owner views the project edit page
- **THEN** the page renders a "Delete project" control in a danger zone separate from the edit form

#### Scenario: Confirmation is required before delete

- **WHEN** the owner activates "Delete project"
- **THEN** the system presents a confirmation dialog naming the project and the count of sessions and active agents to be removed
- **AND** the delete is not submitted until the owner confirms

#### Scenario: Confirming delete submits the delete action

- **WHEN** the owner confirms the delete dialog
- **THEN** the system submits `POST /projects/:id/delete`
- **AND** the browser navigates to the projects list

#### Scenario: Cancelling the confirmation aborts the delete

- **WHEN** the owner dismisses the confirmation dialog
- **THEN** no delete request is sent
- **AND** the project edit page remains unchanged