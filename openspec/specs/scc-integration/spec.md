## ADDED Requirements

### Requirement: Automatic scc installation
The system SHALL automatically download and install the scc binary when first needed.

#### Scenario: First metrics request
- **WHEN** impact metrics are requested and scc is not installed
- **THEN** detect the current platform (OS/architecture)
- **AND** download appropriate scc release from GitHub
- **AND** install to ~/.mimo/bin/scc
- **AND** make executable

#### Scenario: scc already installed
- **WHEN** impact metrics are requested and scc exists at ~/.mimo/bin/scc
- **THEN** skip download and use existing binary

### Requirement: scc execution
The system SHALL execute scc on directories to extract complexity metrics.

#### Scenario: Run scc on workspace
- **WHEN** calculating impact metrics
- **THEN** execute scc --by-file --format json on agent-workspace/
- **AND** execute scc --by-file --format json on upstream/
- **AND** parse JSON output for metrics

### Requirement: Complexity metrics extraction
The system SHALL extract code complexity metrics from scc output.

#### Scenario: Parse cyclomatic complexity
- **WHEN** scc JSON output is received
- **THEN** extract cyclomatic complexity per file
- **AND** calculate total complexity delta

#### Scenario: Parse cognitive complexity
- **WHEN** scc JSON output includes cognitive complexity
- **THEN** extract cognitive complexity per file
- **AND** calculate total cognitive complexity delta

#### Scenario: Parse estimated time
- **WHEN** scc JSON output includes estimated time
- **THEN** extract estimated development time per file
- **AND** calculate total estimated time delta

### Requirement: Language breakdown
The system SHALL group metrics by programming language.

#### Scenario: Display language metrics
- **WHEN** displaying complexity metrics
- **THEN** show metrics grouped by language (e.g., TypeScript, Python)
- **AND** for each language show: file count, LOC, complexity

### Requirement: Per-file complexity detail
The system SHALL provide expandable per-file complexity details.

#### Scenario: View file details
- **WHEN** user expands a file in the complexity section
- **THEN** show: file path, LOC, cyclomatic complexity, cognitive complexity
- **AND** indicate if file is new, changed, or deleted

### Requirement: scc result caching
The system SHALL cache scc results for 5 seconds to avoid repeated scanning.

#### Scenario: Cache hit
- **WHEN** impact metrics are requested within 5 seconds of previous request
- **THEN** return cached scc results
- **AND** do not re-execute scc

#### Scenario: Cache miss
- **WHEN** impact metrics are requested and cache is expired
- **THEN** execute scc
- **AND** store results in cache with 5-second TTL

### Requirement: scc error handling
The system SHALL handle scc failures gracefully.

#### Scenario: scc not installed and download fails
- **WHEN** scc is needed but not installed and download fails
- **THEN** display warning: "scc not available - showing file counts only"
- **AND** show [Install scc] button for manual retry
- **AND** continue with file count metrics (no complexity)

#### Scenario: scc execution timeout
- **WHEN** scc execution exceeds 30 seconds
- **THEN** cancel the scan
- **AND** display warning: "scc scan timed out - showing file counts only"
- **AND** continue with file count metrics
