## ADDED Requirements

### Requirement: Per-project feature list storage

The system SHALL persist a list of features per project. Each feature MUST have `id`, `branchName`, `description` (plain text), `done` (boolean), and `createdAt`. Features MUST be stored in `<projectsPath>/<projectId>/features.json`; a missing file MUST be treated as an empty list.

#### Scenario: Features persisted per project

- **WHEN** a feature is added to project "my-app"
- **THEN** the feature is written to `~/.mimo/projects/my-app/features.json`
- **AND** other projects' feature lists are unaffected

#### Scenario: Missing features file

- **WHEN** `features.json` does not exist for a project
- **THEN** the system treats the project as having an empty feature list without error

### Requirement: User can add a feature

The system SHALL allow authenticated users to add a feature to a project by providing a `branchName` and a `description`. Branch names MUST NOT be validated.

#### Scenario: Add feature

- **WHEN** authenticated user submits branchName "dark-mode" and description "Add dark mode toggle" for a project
- **THEN** the feature appears in the project's feature list with `done: false`

### Requirement: User can edit a feature

The system SHALL allow authenticated users to edit a feature's `branchName` and `description`.

#### Scenario: Edit feature

- **WHEN** authenticated user updates the description of an existing feature
- **THEN** the stored feature reflects the new values

### Requirement: User can delete a feature

The system SHALL allow authenticated users to delete a feature from a project.

#### Scenario: Delete feature

- **WHEN** authenticated user deletes a feature
- **THEN** the feature no longer appears in the project's feature list

### Requirement: User can toggle feature done state

The system SHALL allow authenticated users to mark a feature as done or not done via a checkbox.

#### Scenario: Toggle done

- **WHEN** authenticated user checks the done checkbox of a feature
- **THEN** the feature's `done` flag is persisted as `true` and the UI shows it as done

### Requirement: Create session from feature

Each feature in the list SHALL have a "Create session" action that navigates to the session creation form for the current project with the feature's `branchName` prefilled as the branch name and the feature's `description` prefilled as the session notes.

#### Scenario: Navigate with prefill

- **WHEN** authenticated user clicks "Create session" on a feature with branchName "dark-mode" and description "Add dark mode toggle"
- **THEN** the browser navigates to `/projects/:id/sessions/new?branchName=dark-mode&notes=Add%20dark%20mode%20toggle`

#### Scenario: Session notes populated after creation

- **WHEN** the user submits the prefilled session creation form
- **THEN** the new session's notes contain the feature description as plain text
