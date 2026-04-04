## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project. Each session creates repo.fossil but defers checkout creation to agent bootstrap. Session SHALL store agentWorkspacePath instead of checkoutPath.

#### Scenario: Create session with title
- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to upstream/
- **AND** system imports to repo.fossil (fossil import --git or fossil clone)
- **AND** system stores session.yaml with {title: "fix-auth-bug", status: "active", port: null, agentWorkspacePath: ".../agent-workspace"}
- **AND** system displays session view

#### Scenario: Port assignment deferred
- **WHEN** session is created
- **THEN** system stores port: null in session.yaml
- **AND** fossil server is NOT started at creation time
- **AND** port is assigned when agent connects (see agent-lifecycle)

#### Scenario: Duplicate session title
- **WHEN** user submits session title that already exists in project
- **THEN** system appends timestamp to title or returns error

### Requirement: User can delete a session
The system SHALL allow users to remove sessions.

#### Scenario: Delete session with cleanup
- **WHEN** authenticated user deletes session "fix-auth-bug"
- **THEN** system terminates agent process if running
- **AND** system stops Fossil server if running
- **AND** system removes entire session directory including agent-workspace/ and repo.fossil

## RENAMED Requirements

### Requirement: Session stores checkoutPath field
**FROM**: Session stores `checkoutPath` field pointing to checkout directory
**TO**: Session stores `agentWorkspacePath` field pointing to agent-workspace directory

**Reason**: "checkout" is misleading as this directory is not a repository checkout. It's a working directory for agent file operations.

## REMOVED Requirements

### Requirement: System starts Fossil server on session creation
**Reason**: Fossil server now starts when agent connects, not at session creation. This enables deferred bootstrap where agent creates the checkout.
**Migration**: Fossil server lifecycle moved to agent-lifecycle spec. Session now stores port: null until agent connects.
