## ADDED Requirements

### Requirement: Impact refresh runs proportionally to changed files

The system SHALL calculate impact metrics in time proportional to the number of changed files, not the total repository size.

#### Scenario: Refresh in a large repository with one changed file

- **WHEN** the user refreshes impact in a repository with 100,000 files
- **AND** only one file has changed
- **THEN** the refresh completes in under 5 seconds
- **AND** the system does not scan all 100,000 files

### Requirement: Changed files drive SCC execution

The system SHALL run SCC only on files identified as changed by `detectChangedFiles()`, plus a stable baseline sample.

#### Scenario: Two new files and one modified file

- **WHEN** impact refresh detects two new files and one modified file
- **THEN** the system invokes SCC with exactly those three file paths
- **AND** does not pass the entire workspace directory to SCC

### Requirement: Cached baseline provides absolute totals

The system SHALL store a cached baseline of upstream and workspace absolute totals and merge incremental SCC results with that baseline to produce the full `ImpactMetrics` shape.

#### Scenario: Baseline cache is available

- **WHEN** a baseline cache exists for the session
- **AND** impact refresh runs on a small set of changed files
- **THEN** the returned metrics include absolute totals from the baseline
- **AND** include per-file detail for changed files

### Requirement: Baseline refreshes on explicit request

The system SHALL replace the cached baseline with a fresh full-repository scan when the user explicitly requests a full refresh.

#### Scenario: User clicks full refresh

- **WHEN** the user triggers a full impact refresh
- **THEN** the system runs SCC on the entire workspace and upstream
- **AND** updates the cached baseline
- **AND** returns complete metrics

### Requirement: Trend calculation remains accurate with incremental data

The system SHALL continue to compute trend indicators (↑ ↓ →) from the incremental result and previous state.

#### Scenario: Incremental refresh increases changed file count

- **WHEN** incremental refresh detects more changed files than the previous refresh
- **THEN** the trend indicator for changed files shows "↑"
