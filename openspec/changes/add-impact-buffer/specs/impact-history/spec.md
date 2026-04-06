## ADDED Requirements

### Requirement: Impact record creation on commit
The system SHALL create an impact record on every commit, storing the current metrics.

#### Scenario: Commit triggers impact storage
- **WHEN** user clicks Commit button and commit succeeds
- **THEN** capture current file counts (new/changed/deleted)
- **AND** capture current LOC metrics
- **AND** capture current complexity metrics
- **AND** store to ~/.mimo/projects/{project-id}/impacts/{sessionId-commitHash}.yaml

### Requirement: Impact record data structure
The system SHALL store specific fields in each impact record.

#### Scenario: Store impact metadata
- **WHEN** creating an impact record
- **THEN** include: id, sessionId, sessionName, projectId, commitHash, commitDate
- **AND** include files: {new, changed, deleted}
- **AND** include linesOfCode: {added, removed, net}
- **AND** include complexity: {cyclomatic, cognitive, estimatedMinutes}
- **AND** include complexityByLanguage: array of language breakdowns
- **AND** include fossilUrl for viewing commit

### Requirement: Impact record survives session deletion
The system SHALL retain impact records even if the associated session is deleted.

#### Scenario: View impact of deleted session
- **WHEN** viewing impact history and session has been deleted
- **THEN** display impact record normally
- **AND** show "(session deleted)" indicator
- **AND** do not link to session detail

### Requirement: Project impact history page
The system SHALL provide a page listing all impact records for a project.

#### Scenario: View project history
- **WHEN** user navigates to /projects/{id}/impacts
- **THEN** display table of all impact records for the project
- **AND** sort by commitDate descending (newest first)
- **AND** show: session name, commit hash, files, LOC, complexity, date

#### Scenario: Session link in history
- **WHEN** impact record has an existing session
- **THEN** session name SHALL be a link to /sessions/{sessionId}
- **AND** link SHALL open in new tab

#### Scenario: Deleted session in history
- **WHEN** impact record references a deleted session
- **THEN** display session name with "(deleted)" suffix
- **AND** no link SHALL be rendered

### Requirement: Fossil commit links
The system SHALL provide links to fossil web for each commit in the history.

#### Scenario: View commit in fossil
- **WHEN** user clicks commit hash in impact history
- **THEN** open fossil web timeline/diff for that commit in new tab

### Requirement: Composite key storage
The system SHALL use sessionId-commitHash as the filename for impact records.

#### Scenario: Store with composite key
- **WHEN** persisting an impact record
- **THEN** filename SHALL be {sessionId}-{commitHash}.yaml
- **AND** directory SHALL be ~/.mimo/projects/{project-id}/impacts/
