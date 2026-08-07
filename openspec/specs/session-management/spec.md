# session-management Specification

## Purpose

Define how sessions are created, deleted, and rendered. A session is a workspace where a user drives an agent against a project checkout; the session page renders a two-frame buffer layout under a shared top-nav.

## Requirements

### Requirement: User can create a session

The system SHALL allow users to create sessions within a project. Each session creates repo.fossil but defers checkout creation to agent bootstrap.

#### Scenario: Create session with title

- **WHEN** authenticated user submits session title "fix-auth-bug" for project "my-app"
- **THEN** system creates directory ~/.mimo/projects/my-app/sessions/fix-auth-bug/
- **AND** system clones project's repository to upstream/
- **AND** system imports to repo.fossil (fossil import --git or fossil clone)
- **AND** system stores session.yaml with {title: "fix-auth-bug", status: "active", port: null}
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
- **AND** system removes entire session directory including checkout/ and repo.fossil

### Requirement: Session page embed mode

The session page SHALL support an embed mode, activated by the `embed=1` URL query flag, that suppresses layout chrome so the page can be rendered inside a same-origin iframe at narrow widths.

#### Scenario: Embed flag suppresses chrome

- **WHEN** the session page is requested with `?embed=1`
- **THEN** system renders the page without the global top-nav, without the session footer actions bar, and without the keyboard shortcuts bar
- **AND** the two-frame buffer layout and all buffer functionality remain intact

#### Scenario: Embed mode defaults the right frame to collapsed

- **WHEN** the session page is requested with `?embed=1`
- **AND** no explicit frame-state preference is otherwise persisted for this session
- **THEN** system renders the right frame in the collapsed state on initial load

#### Scenario: Embed mode suppresses pin affordances

- **WHEN** the session page is requested with `?embed=1`
- **THEN** system does not render the pin checkbox in the top-nav
- **AND** system does not render the pinned-sessions side-menu (`[≡]`) button

#### Scenario: Embed mode hides non-essential right-frame buffers

- **WHEN** the session page is requested with `?embed=1`
- **THEN** system renders only the Files, Impact, and Notes buffers in the right frame
- **AND** system does NOT render the Summary, MCP, or Plan buffers in the right frame
- **AND** all left-frame buffers (Chat, Terminal, Edit, Patches, Commit) remain available

#### Scenario: Non-embed rendering is unchanged

- **WHEN** the session page is requested without the `embed` flag
- **THEN** system renders the page with the full top-nav, footer actions bar, shortcuts bar, pin checkbox, and side-menu button as applicable
- **AND** all right-frame buffers (Files, Impact, Notes, Summary, MCP, Plan) are available

### Requirement: Session creation form accepts prefill parameters

The session creation page (`GET /projects/:projectId/sessions/new`) SHALL accept optional `branchName` and `notes` query parameters. When present, the branch name field MUST be prefilled with `branchName` verbatim, and on form submission the `notes` value MUST be written to the new session's notes as plain text. When absent, current behavior MUST be unchanged.

#### Scenario: Prefill branch name

- **WHEN** user opens `/projects/abc/sessions/new?branchName=dark-mode&notes=Add%20dark%20mode`
- **THEN** the branch name field is prefilled with "dark-mode"

#### Scenario: Notes carried into created session

- **WHEN** user submits the session creation form after opening it with a `notes` query param
- **THEN** the created session's notes contain the provided notes text

#### Scenario: No prefill params

- **WHEN** user opens `/projects/abc/sessions/new` without query params
- **THEN** the form renders with its existing defaults