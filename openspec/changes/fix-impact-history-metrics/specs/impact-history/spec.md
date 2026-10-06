## MODIFIED Requirements

### Requirement: Impact record creation on commit

The system SHALL create an impact record on every commit, storing metrics calculated from the committed files as they differed from upstream before the commit was applied.

#### Scenario: Commit triggers impact storage

- **WHEN** user clicks Commit button and commit succeeds
- **THEN** capture current file counts (new/changed/deleted)
- **AND** capture current LOC metrics
- **AND** capture current complexity metrics
- **AND** store to ~/.mimo/projects/{project-id}/impacts/{sessionId-commitHash}.yaml

#### Scenario: Modified file complexity is recorded

- **WHEN** a commit modifies an existing file and increases its cyclomatic complexity
- **THEN** the impact record's `complexity.cyclomatic` SHALL be greater than 0
- **AND** `linesOfCode.added` SHALL reflect the lines added to that file

#### Scenario: Deleted file is recorded

- **WHEN** a commit deletes a file that contained code
- **THEN** the impact record's `linesOfCode.removed` SHALL include that file's lines

#### Scenario: Partial commit only records selected files

- **WHEN** the workspace has several changed files and the user commits only a subset
- **THEN** the impact record's file counts and LOC SHALL include only the committed files

#### Scenario: Estimated time includes modified files

- **WHEN** a commit only modifies existing files and adds lines of code
- **THEN** the impact record's `complexity.estimatedMinutes` SHALL be greater than 0

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

#### Scenario: Store tokens spent

- **WHEN** creating an impact record and the session accumulated token usage since its previous commit
- **THEN** include tokens: {input, output, thought, cachedRead, cachedWrite, total}
- **AND** reset the session's accumulated token usage

#### Scenario: No token usage reported

- **WHEN** creating an impact record and no token usage was accumulated
- **THEN** the `tokens` field SHALL be omitted

### Requirement: Project impact history page

The system SHALL provide a page listing all impact records for a project.

#### Scenario: View project history

- **WHEN** user navigates to /projects/{id}/impacts
- **THEN** display table of all impact records for the project
- **AND** sort by commitDate descending (newest first)
- **AND** show: session name, commit hash, files, LOC, complexity, estimated time, tokens, date

#### Scenario: Session link in history

- **WHEN** impact record has an existing session
- **THEN** session name SHALL be a link to /sessions/{sessionId}
- **AND** link SHALL open in new tab

#### Scenario: Deleted session in history

- **WHEN** impact record references a deleted session
- **THEN** display session name with "(deleted)" suffix
- **AND** no link SHALL be rendered

#### Scenario: Record without tokens

- **WHEN** an impact record has no `tokens` field
- **THEN** the Tokens column SHALL display "—"
