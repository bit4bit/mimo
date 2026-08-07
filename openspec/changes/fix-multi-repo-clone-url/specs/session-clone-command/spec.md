## ADDED Requirements

### Requirement: Clone command uses per-repository URL

The system SHALL build the browser clone command for a session repository from a per-repository clone URL that includes the repository id (`/<sid>/<repoId>.git/`), matching the bare session repository actually seeded on disk. The system SHALL NOT emit a legacy per-session URL (`/<sid>.git/`) for a session whose repositories are keyed by `repoId`.

#### Scenario: Single-repo session clone command

- **WHEN** a session has one repository with project repo id "backend"
- **THEN** the clone command URL path is `/<sid>/backend.git/`
- **AND** the command is `git clone "<AUTH_URL>" "<sessionName>"`
- **AND** `<AUTH_URL>` contains session credentials embedded in the per-repo URL

#### Scenario: Multi-repo session clone command defaults to primary repository

- **WHEN** a session has repositories "backend" (primary) and "frontend"
- **THEN** the clone modal opens with the primary repository selected by default
- **AND** the displayed command uses the primary repository's per-repo URL and mount path

### Requirement: Clone modal exposes repository selector for multi-repo sessions

The system SHALL render a repository selector in the clone workspace modal when the session has more than one repository. Selecting a repository SHALL update the displayed clone command to that repository's URL and suggested target directory. For single-repo sessions the selector SHALL be omitted.

#### Scenario: Selector lists all session repositories

- **WHEN** a session has repositories "backend" mounted at "backend" and "frontend" mounted at "frontend"
- **THEN** the clone modal renders a selector with one option per repository
- **AND** each option label includes the repository name and its mount path

#### Scenario: Selector swaps displayed command

- **WHEN** the user changes the selector from "backend" to "frontend"
- **THEN** the displayed command updates to use the frontend repository's per-repo URL
- **AND** the suggested target directory becomes `<sessionName>/frontend`

#### Scenario: Copy uses the currently selected command

- **WHEN** the user clicks the command text while "frontend" is selected
- **THEN** the clipboard receives the frontend repository's clone command
- **AND** the system shows copy success feedback

### Requirement: Suggested clone target mirrors workspace mount layout

The system SHALL suggest a clone target directory that mirrors the session workspace mount layout. For a repository mounted at a non-root mount path, the suggested directory SHALL be `<sessionName>/<mountPath>`. For a repository mounted at root (`.`), the suggested directory SHALL be `<sessionName>`. The session name SHALL be sanitized by replacing `/` and `\` with `-`.

#### Scenario: Multi-repo mount path target

- **WHEN** repository "frontend" is mounted at "frontend" in session "Fix login"
- **THEN** the suggested clone target is `Fix-login/frontend`

#### Scenario: Root mount target

- **WHEN** the sole repository is mounted at "." in session "Fix login"
- **THEN** the suggested clone target is `Fix-login`