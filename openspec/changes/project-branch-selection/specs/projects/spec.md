## ADDED Requirements

### Requirement: Projects can specify source branch
The system SHALL allow projects to optionally specify a source branch to clone from. If not specified, the system SHALL use the repository's default branch.

#### Scenario: Create project with source branch
- **WHEN** authenticated user creates project with repoUrl "https://github.com/user/repo.git" and sourceBranch "feature/v2"
- **THEN** system stores project with sourceBranch "feature/v2"
- **AND** system clones from "feature/v2" branch when creating sessions

#### Scenario: Create project without source branch
- **WHEN** authenticated user creates project with repoUrl "https://github.com/user/repo.git" and no sourceBranch
- **THEN** system stores project without sourceBranch
- **AND** system clones from repository default branch when creating sessions

#### Scenario: Source branch field is optional
- **WHEN** authenticated user views project creation form
- **THEN** sourceBranch field is displayed as optional
- **AND** field help text indicates "Leave empty to use repository default branch"

### Requirement: Projects can specify new branch
The system SHALL allow projects to optionally specify a new branch to create locally. The branch SHALL be created during session initialization.

#### Scenario: Create project with new branch
- **WHEN** authenticated user creates project with newBranch "ai-session-feature-x"
- **THEN** system stores project with newBranch "ai-session-feature-x"
- **AND** system creates branch locally after cloning
- **AND** system switches to new branch in upstream directory

#### Scenario: Create project with source and new branch
- **WHEN** authenticated user creates project with sourceBranch "develop" and newBranch "ai-feature"
- **THEN** system clones from "develop" branch
- **AND** system creates and switches to "ai-feature" branch
- **AND** new branch is based on "develop"

#### Scenario: New branch field is optional
- **WHEN** authenticated user views project creation form
- **THEN** newBranch field is displayed as optional
- **AND** field help text indicates "Create a dedicated branch for AI sessions"

### Requirement: Branch information is immutable
The system SHALL store branch information immutably. Branch settings SHALL NOT be editable after project creation.

#### Scenario: View project with branches configured
- **WHEN** authenticated user views project detail with sourceBranch and newBranch configured
- **THEN** system displays sourceBranch and newBranch information
- **AND** system does not provide edit controls for branch fields

#### Scenario: Edit project form excludes branch fields
- **WHEN** authenticated user views project edit form
- **THEN** sourceBranch and newBranch fields are not displayed
- **AND** existing branch configuration remains unchanged

### Requirement: Branch creation for Git repositories
The system SHALL create branches in Git repositories using git commands.

#### Scenario: Create Git branch
- **WHEN** project has repoType "git" and newBranch "feature-x"
- **AND** system initializes session
- **THEN** system executes "git checkout -b feature-x" in upstream directory
- **AND** if branch exists, system overwrites with new branch

#### Scenario: Clone Git with source branch
- **WHEN** project has repoType "git" and sourceBranch "develop"
- **AND** system initializes session
- **THEN** system executes "git clone --branch develop <repoUrl>"

### Requirement: Branch creation for Fossil repositories
The system SHALL create branches in Fossil repositories using fossil commands.

#### Scenario: Create Fossil branch
- **WHEN** project has repoType "fossil" and newBranch "feature-x"
- **AND** system initializes session
- **THEN** system executes "fossil branch new feature-x current"
- **AND** if branch exists, fossil updates the branch pointer

#### Scenario: Checkout Fossil with source branch
- **WHEN** project has repoType "fossil" and sourceBranch "develop"
- **AND** system initializes session
- **THEN** system executes "fossil checkout develop" after opening repository

### Requirement: No immediate push for new branches
The system SHALL NOT push new branches to remote during session initialization. Branch SHALL be pushed on first Commit action.

#### Scenario: New branch not pushed immediately
- **WHEN** project has newBranch "ai-session-1"
- **AND** system completes session initialization
- **THEN** new branch exists only locally in upstream directory
- **AND** no push command is executed

#### Scenario: New branch pushed on commit
- **WHEN** user clicks Commit button for session
- **AND** commit succeeds
- **THEN** push command includes the new branch
- **AND** branch appears in remote repository
