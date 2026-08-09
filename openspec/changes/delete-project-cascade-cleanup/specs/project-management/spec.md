## MODIFIED Requirements

### Requirement: User can delete a project

The system SHALL allow users to remove projects and all associated sessions. Deleting a project SHALL cascade through every session owned by the project using the shared session-deletion use case (revoking MCP tokens, removing session filesystem and centralized bare VCS repos, clearing in-memory session/file-sync/impact state, and notifying every assigned agent via `session_ended`), remove stale pinned-session references for the deleted sessions, clear the project VCS cache, remove the project directory (including `features.json` and `impacts/`), and redirect to the projects list. A confirmed delete affordance SHALL be available on the project edit page.

#### Scenario: Delete project with confirmation

- **WHEN** authenticated owner confirms deletion of project "my-app" from the project edit page
- **THEN** system removes `~/.mimo/projects/my-app/` directory recursively
- **AND** system deletes each session via the shared session-deletion use case (token revocation, centralized VCS repo removal, in-memory state cleanup)
- **AND** system notifies every agent assigned to the project's sessions via `session_ended`
- **AND** system removes pinned-session references for the deleted sessions
- **AND** system clears the project VCS cache (git and fossil)
- **AND** system redirects to projects list

#### Scenario: Delete project with active agents disconnects them

- **WHEN** authenticated owner confirms deletion of a project that has sessions with online assigned agents
- **THEN** system sends `session_ended` to each assigned agent for each affected session
- **AND** the agents tear down their ACP processes for those sessions
- **AND** in-flight prompts are not cancelled (fire-and-forget notification)

#### Scenario: Delete project with features and impacts removes them

- **WHEN** authenticated owner deletes a project that has features in `features.json` and impact records in `impacts/`
- **THEN** system removes the project directory recursively, deleting `features.json` and `impacts/`
- **AND** impact state for each session is cleared from memory

#### Scenario: Delete project via internal API runs the same cascade

- **WHEN** an authenticated owner calls `DELETE /api/internal/projects/:id`
- **THEN** system runs the same project-deletion use case as the web action
- **AND** the response is `{ success: true }`
- **AND** the project directory, sessions, pins, and VCS cache are removed