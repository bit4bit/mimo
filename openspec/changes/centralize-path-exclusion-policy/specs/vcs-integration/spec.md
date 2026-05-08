## MODIFIED Requirements

### Requirement: System supports Git repositories

The system SHALL import Git repositories into Fossil for session management.

#### Scenario: Import Git repository

- **WHEN** user creates project with Git URL
- **THEN** system runs "fossil import --git" to create repo.fossil
- **AND** system stores imported repository in session directory
- **AND** default excluded paths are consistently managed from a single policy module

### Requirement: System commits changes and pushes to original repository

The system SHALL commit changes in the session and push to the original repository, showing any conflicts.

#### Scenario: Successful commit and push

- **WHEN** user presses C-x c and enters commit message
- **THEN** system runs "fossil commit" in session worktree
- **AND** system syncs committed changes to original repository
- **AND** built-in exclusions are not included in the commit
- **AND** fossil ignore-glob patterns are derived from the centralized path policy
