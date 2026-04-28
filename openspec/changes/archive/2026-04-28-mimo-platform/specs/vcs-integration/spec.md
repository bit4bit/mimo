## ADDED Requirements

### Requirement: System supports Git repositories
The system SHALL import Git repositories into Fossil for session management.

#### Scenario: Import Git repository
- **WHEN** user creates project with Git URL "https://github.com/user/repo.git"
- **THEN** system runs "fossil import --git" to create repo.fossil
- **AND** system stores imported repository in session directory

#### Scenario: Import private Git repository
- **WHEN** user creates project with Git URL and credentials
- **THEN** system uses provided credentials for clone
- **AND** system stores repository securely

### Requirement: System supports Fossil repositories
The system SHALL work with native Fossil repositories.

#### Scenario: Clone Fossil repository
- **WHEN** user creates project with Fossil URL "https://fossil.example.com/repo"
- **THEN** system runs "fossil clone" to create repo.fossil
- **AND** system stores repository in session directory

### Requirement: System commits changes and pushes to original repository
The system SHALL commit changes in the session and push to the original repository, showing any conflicts.

#### Scenario: Successful commit and push
- **WHEN** user presses C-x c and enters commit message "Fix authentication"
- **THEN** system runs "fossil commit -m 'Fix authentication'" in session worktree
- **AND** system syncs committed changes to original repository
- **AND** system runs appropriate push command (git push or fossil push)
- **AND** system displays "Changes committed and pushed successfully"

#### Scenario: Push rejected due to conflicts
- **WHEN** user commits and system attempts push to original repository
- **AND** original repository has conflicting changes
- **THEN** system displays detailed conflict information:
- **AND** system shows which files conflict
- **AND** system explains the conflict reason (e.g., "remote has newer changes")
- **AND** system provides guidance: "Please pull latest changes and resolve conflicts manually"
- **AND** commit remains in session but not pushed

#### Scenario: Commit with no changes
- **WHEN** user attempts commit with no modified files
- **THEN** system displays "No changes to commit"

#### Scenario: Network error during push
- **WHEN** user commits and system attempts push
- **AND** network error occurs
- **THEN** system displays error message with reason
- **AND** system shows "Commit saved locally. Retry push when connection restored"
- **AND** commit remains in session but not pushed

### Requirement: System shows conflict details
The system SHALL display detailed information about push conflicts.

#### Scenario: Show file-level conflicts
- **WHEN** push fails with conflicts
- **THEN** system lists each conflicted file in changes buffer with [!] marker
- **AND** system shows conflict type per file:
- **AND** "content conflict" for files modified in both places
- **AND** "delete/modify conflict" for file deleted in one, modified in other
- **AND** "add/add conflict" for file added with different content

#### Scenario: Show merge preview
- **WHEN** user clicks conflicted file
- **THEN** system displays merge preview showing:
- **AND** remote version content
- **AND** local (session) version content
- **AND** conflict markers indicating differences

#### Scenario: Manual conflict resolution guidance
- **WHEN** conflicts are detected
- **THEN** system displays step-by-step resolution options:
- **AND** "Use remote version" - discard local changes
- **AND** "Use local version" - force push (with warning)
- **AND** "Open in external editor" - manual merge
- **AND** system waits for user choice before proceeding

### Requirement: System shows repository status
The system SHALL display current VCS status.

#### Scenario: Show modified files
- **WHEN** user views session status
- **THEN** system runs "fossil changes" or "git status"
- **AND** system displays modified, added, and deleted files

#### Scenario: Show commit history
- **WHEN** user requests commit history
- **THEN** system displays recent commits with messages and authors
