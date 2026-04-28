## ADDED Requirements

### Requirement: Duplication Detection Service
The system SHALL provide a JscpdService that wraps the jscpd tool for detecting code duplication, following the same patterns as the existing SccService.

#### Scenario: Service initialization
- **WHEN** the JscpdService is instantiated
- **THEN** it SHALL be configured with a path to the jscpd binary
- **AND** it SHALL support lazy installation of jscpd if not present

#### Scenario: Running jscpd on specific files
- **WHEN** JscpdService.runOnFiles is called with a list of file paths
- **THEN** it SHALL execute jscpd with those files as input
- **AND** it SHALL return parsed duplication metrics
- **AND** it SHALL respect .gitignore, .mimoignore, and .jscpdignore patterns

### Requirement: Duplication Delta Calculation
The ImpactCalculator SHALL calculate duplication metrics representing the delta between upstream and workspace, showing only duplication introduced by changes.

#### Scenario: Calculate introduced duplication
- **WHEN** calculating impact for a session
- **THEN** the system SHALL identify changed files (new, modified, deleted)
- **AND** it SHALL run jscpd only on changed files
- **AND** it SHALL classify each found clone as "introduced" if at least one occurrence is in a changed file
- **AND** it SHALL return duplication metrics including total duplicated lines and tokens

#### Scenario: Cross-file duplicates
- **WHEN** jscpd finds identical code in two different files
- **AND** at least one file is changed
- **THEN** the system SHALL classify this as a cross-file duplicate
- **AND** it SHALL include source file, target file, line numbers, and code content

#### Scenario: Intra-file duplicates
- **WHEN** jscpd finds identical code within the same file
- **AND** the file is changed
- **THEN** the system SHALL classify this as an intra-file duplicate
- **AND** it SHALL include the file path and both line ranges

### Requirement: Duplication Metrics Structure
The ImpactMetrics type SHALL include a duplication field with detailed duplication information.

#### Scenario: Metrics structure
- **WHEN** impact calculation completes
- **THEN** the duplication field SHALL contain:
  - duplicatedLines: total lines in introduced clones
  - duplicatedTokens: total tokens in introduced clones
  - percentage: percentage of changed code that is duplicated
  - clones: array of clone blocks with file paths, line numbers, and content
  - byFile: map grouping clones by the changed file that introduced them

#### Scenario: Percentage calculation
- **WHEN** calculating duplication percentage
- **THEN** it SHALL be computed as (duplicatedLines / totalChangedLines) * 100
- **AND** totalChangedLines SHALL be the sum of all added and removed lines

### Requirement: Duplication Display in Impact Buffer
The ImpactBuffer component SHALL display duplication metrics as a first-class section, alongside existing SCC metrics.

#### Scenario: Show duplication section
- **WHEN** the ImpactBuffer renders with duplication data
- **THEN** it SHALL display a "Code Duplication" section
- **AND** it SHALL show total duplicated lines and percentage
- **AND** it SHALL show the number of duplication blocks
- **AND** it SHALL visually highlight high duplication (>30%)

#### Scenario: Show cross-file duplicates
- **WHEN** cross-file duplicates exist
- **THEN** the system SHALL display them in a subsection
- **AND** it SHALL show source file, target file, and line counts
- **AND** it SHALL indicate when the target file existed in upstream

#### Scenario: Show intra-file duplicates
- **WHEN** intra-file duplicates exist
- **THEN** the system SHALL display them in a separate subsection
- **AND** it SHALL show the file path and the line ranges that match

### Requirement: Auto-Commit Duplication Checks
The sync service SHALL check duplication levels before auto-committing and provide configurable warnings or blocks.

#### Scenario: Warning threshold
- **WHEN** auto-commit is triggered
- **AND** duplication percentage is >= 15%
- **THEN** the commit message SHALL include a warning about duplication

#### Scenario: Block threshold
- **WHEN** auto-commit is triggered
- **AND** duplication percentage is >= 30%
- **THEN** the system SHALL block the commit
- **AND** it SHALL notify the user with the duplication details
- **AND** it SHALL require manual review before proceeding

#### Scenario: Configurable thresholds
- **WHEN** configuring session settings
- **THEN** users SHALL be able to set warningThreshold (default: 15%)
- **AND** users SHALL be able to set blockThreshold (default: 30%)
- **AND** setting blockThreshold to 0 SHALL disable blocking

### Requirement: JSCPD Ignore File Support
The system SHALL respect ignore patterns when running jscpd.

#### Scenario: Composite ignore file
- **WHEN** running jscpd on a directory
- **THEN** the system SHALL build a composite ignore file
- **AND** it SHALL include patterns from .gitignore, .mimoignore, and .jscpdignore
- **AND** it SHALL write the composite to .jscpdignore in the target directory
