## ADDED Requirements

### Requirement: System commits agent changes to upstream repository
The system SHALL provide a commit and push flow that syncs agent changes from repo.fossil to agent-workspace/, copies to upstream/, commits, and pushes to remote. The commit message SHALL include an ISO timestamp.

#### Scenario: Successful commit and push with Git upstream
- **WHEN** user clicks "Commit" button in session view
- **THEN** system runs "fossil up" in agent-workspace/ to sync with repo.fossil
- **AND** system copies all files from agent-workspace/ to upstream/ (clean slate)
- **AND** system commits in upstream/ with message "Mimo commit at 2026-04-05T14:30:00.000Z"
- **AND** system pushes upstream/ to remote origin
- **AND** system displays "Changes committed and pushed successfully!"

#### Scenario: Successful commit and push with Fossil upstream
- **WHEN** user clicks "Commit" button and upstream is Fossil repository
- **THEN** system syncs agent-workspace with repo.fossil
- **AND** system copies files to upstream/
- **AND** system runs "fossil commit" in upstream/
- **AND** system runs "fossil push" from upstream/
- **AND** system displays success message

#### Scenario: No changes to commit
- **WHEN** user clicks "Commit" button
- **AND** agent-workspace has no changes after fossil sync
- **THEN** system displays "No changes to commit"
- **AND** system does not attempt commit or push

#### Scenario: Push fails due to remote rejection
- **WHEN** user clicks "Commit" button
- **AND** commit succeeds
- **AND** push fails due to remote rejection
- **THEN** system displays error message "Push failed: [remote error details]"
- **AND** commit remains in upstream/
- **AND** user can retry push later

#### Scenario: Fossil sync fails
- **WHEN** user clicks "Commit" button
- **AND** "fossil up" in agent-workspace/ fails
- **THEN** system displays "Failed to sync with agent: [error details]"
- **AND** system does not proceed to copy or commit

### Requirement: System uses clean slate copy to upstream
The system SHALL copy all files from agent-workspace/ to upstream/ by deleting existing files (except VCS directories) and copying fresh.

#### Scenario: Clean copy removes old files
- **WHEN** system copies agent-workspace/ to upstream/
- **AND** upstream/ contains files not in agent-workspace/
- **THEN** system deletes extra files from upstream/
- **AND** system copies all files from agent-workspace/ to upstream/

#### Scenario: Preserve VCS directories during copy
- **WHEN** system copies to upstream/
- **AND** upstream/ is Git repository with .git/ directory
- **THEN** system preserves .git/ directory
- **AND** copies all other files from agent-workspace/

#### Scenario: Preserve Fossil DB during copy
- **WHEN** system copies to upstream/
- **AND** upstream/ is Fossil repository
- **THEN** system preserves .fossil file
- **AND** copies all other files from agent-workspace/
