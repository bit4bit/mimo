## ADDED Requirements

### Requirement: Session page exposes clone workspace command
The system SHALL provide a session-level action that reveals a ready-to-run Fossil command for cloning and opening the current session workspace.

#### Scenario: Clone action is shown next to ACP status
- **WHEN** authenticated user opens a session detail page
- **THEN** the page shows a `Clone Workspace` action in the header
- **AND** the action is rendered adjacent to the ACP status indicator (`Agent ready` or equivalent)

#### Scenario: Clone action opens command popup
- **WHEN** user clicks `Clone Workspace`
- **THEN** system opens a modal popup containing the clone/open command
- **AND** the command is visible by default, including embedded credentials in the URL

### Requirement: Clone command format is single Fossil open command
The system SHALL render a single-command Fossil invocation for workspace clone/open.

#### Scenario: Command uses authenticated URL and session name workdir
- **WHEN** system prepares clone command for session "Fix login flow"
- **THEN** command format is exactly `fossil open "<AUTH_URL>" --workdir "<SESSION_NAME>"`
- **AND** `<AUTH_URL>` contains session credentials (`username:password@host/path`)
- **AND** `<SESSION_NAME>` is the session name with `/` and `\\` replaced by `-`

#### Scenario: User copies command from popup
- **WHEN** user clicks the command text (or copy control) in the popup
- **THEN** system writes the full command string to clipboard
- **AND** system shows immediate copy success feedback
- **AND** if clipboard write fails, system shows explicit failure feedback without hiding the command
