## MODIFIED Requirements

### Requirement: R9 - Impact Buffer

The Impact buffer SHALL display impact metrics including files, lines of code, and complexity.

#### Scenario: LOC display format

- **WHEN** the Impact buffer displays Lines of Code metrics
- **THEN** it SHALL display Total, Added, and Removed
- **AND** each metric SHALL show absolute values with delta in `upstream→workspace(delta)` format
- **AND** trends SHALL indicate changes from previous refresh using ↑, ↓, or → arrows

### Requirement: R9.1 - Lines of Code Metrics

The Impact buffer SHALL display Lines of Code with the following structure:

- **Total**: Total lines of code in upstream and workspace with delta
- **Added**: Cumulative lines added in workspace (upstream shows 0)
- **Removed**: Cumulative lines removed in workspace (upstream shows 0)

#### Scenario: Total LOC calculation

- **WHEN** calculating total Lines of Code
- **THEN** Total SHALL equal the sum of all file lines in the codebase
- **AND** display format SHALL be `{upstreamTotal}→{workspaceTotal}({delta})`

#### Scenario: Added LOC display

- **WHEN** displaying added Lines of Code
- **THEN** upstream value SHALL be 0
- **AND** workspace value SHALL be cumulative lines added
- **AND** display format SHALL be `0→{added}({delta})`

#### Scenario: Removed LOC display

- **WHEN** displaying removed Lines of Code
- **THEN** upstream value SHALL be 0
- **AND** workspace value SHALL be cumulative lines removed
- **AND** display format SHALL be `0→{removed}({delta})`

### Requirement: R9.2 - LOC Trends

The Impact buffer SHALL display trend indicators (↑, ↓, →) for Lines of Code metrics, comparing current absolute values to previous refresh values.

#### Scenario: Total trend calculation

- **WHEN** the total workspace LOC has increased from previous refresh
- **THEN** the trend indicator SHALL show ↑
- **AND** when decreased, SHALL show ↓
- **AND** when unchanged, SHALL show →

#### Scenario: Added trend calculation

- **WHEN** the cumulative added LOC has changed from previous refresh
- **THEN** the trend indicator SHALL reflect the direction of change

#### Scenario: Removed trend calculation

- **WHEN** the cumulative removed LOC has changed from previous refresh
- **THEN** the trend indicator SHALL reflect the direction of change

### Requirement: R9.3 - LOC Display Consistency

The Lines of Code section SHALL follow the same display pattern as the Complexity section, using `absolute→current(delta)` format with trend arrows.

#### Scenario: Complexity comparison

- **WHEN** displaying both Complexity and Lines of Code sections
- **THEN** both SHALL use consistent formatting
- **AND** both SHALL display absolute values with deltas in parentheses
- **AND** both SHALL show trend arrows for each metric
