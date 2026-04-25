## MODIFIED Requirements

### Requirement: Impact calculation provides diagnostic logging

The system SHALL provide comprehensive debug logging for the entire impact calculation pipeline when the `DEBUG` environment variable is set. Logs SHALL use structured prefixes for grepability.

#### Scenario: Cache hit logged with age
- **GIVEN** SCC metrics cached for directory `/project`
- **WHEN** impact calculation requests metrics without force refresh
- **THEN** log `[scc:cache:hit] directory=/project age=12345ms`
- **AND** cached metrics are returned

#### Scenario: Cache miss logged with reason
- **GIVEN** no cache entry for directory `/project`
- **WHEN** impact calculation requests metrics
- **THEN** log `[scc:cache:miss] directory=/project reason=no_entry`
- **AND** SCC binary is executed

#### Scenario: Force refresh bypasses cache
- **GIVEN** valid cached metrics for directory `/project`
- **WHEN** impact calculation requests metrics with force=true
- **THEN** log `[scc:cache:check] directory=/project force=true`
- **AND** log `[scc:cache:miss] directory=/project reason=force_refresh`
- **AND** SCC binary is executed

#### Scenario: Raw SCC output logged
- **GIVEN** SCC execution succeeds
- **WHEN** parsing JSON output
- **THEN** log `[scc:raw] directory=/project json={truncated}`
- **AND** first 500 characters of JSON are included

#### Scenario: Per-file delta logged
- **GIVEN** upstream file has complexity 100
- **AND** workspace file has complexity 106
- **WHEN** calculating impact
- **THEN** log `[impact:delta:file] path=src/file.ts old=100 new=106 delta=6`

#### Scenario: Changed files detection logged
- **GIVEN** file changes exist between upstream and workspace
- **WHEN** detecting changed files
- **THEN** log `[files:compare] upstream=50 workspace=52`
- **AND** log `[files:result] added=1 modified=1 deleted=0`
- **AND** log `[files:detail]` for each changed file

---

### Requirement: Complexity display shows absolute values with delta

The system SHALL display complexity metrics in format showing absolute before/after values alongside the delta.

#### Scenario: Cyclomatic complexity displayed with absolute values
- **GIVEN** upstream cyclomatic complexity is 156
- **AND** workspace cyclomatic complexity is 162
- **WHEN** rendering impact buffer
- **THEN** display `Cyclomatic: 156 → 162 (+6) ↑`
- **AND** trend arrow indicates increase

#### Scenario: Cognitive complexity displayed with absolute values
- **GIVEN** upstream cognitive complexity is 45
- **AND** workspace cognitive complexity is 42
- **WHEN** rendering impact buffer
- **THEN** display `Cognitive: 45 → 42 (-3) ↓`
- **AND** trend arrow indicates decrease

#### Scenario: Zero delta shows stable indicator
- **GIVEN** upstream and workspace complexity are equal
- **WHEN** rendering impact buffer
- **THEN** display `Cyclomatic: 156 → 156 (0) →`
- **AND** stable arrow is shown

---

### Requirement: SCC output processed in consistent order

The system SHALL process SCC JSON output in deterministic order to ensure consistent calculations.

#### Scenario: Files sorted by path before processing
- **GIVEN** SCC returns files in arbitrary order
- **WHEN** parsing SCC output
- **THEN** files are sorted by path alphabetically
- **AND** parsed results are deterministic

---

### Requirement: Anomalous deltas are detected and flagged

The system SHALL detect and flag anomalous complexity deltas that exceed reasonable thresholds.

#### Scenario: Single file delta exceeds 500% threshold
- **GIVEN** file has upstream complexity of 10
- **AND** workspace reports complexity of 100 (900% increase)
- **WHEN** calculating per-file delta
- **THEN** log `[impact:anomaly] detected: single_file_threshold path=file.ts old=10 new=100`
- **AND** delta is coerced to 0 for display

#### Scenario: Total delta exceeds 1000 complexity points
- **GIVEN** total cyclomatic delta is -1500
- **WHEN** calculating impact totals
- **THEN** log `[impact:anomaly] detected: total_threshold delta=-1500`
- **AND** warning flag is set in response

---

### Requirement: Diagnostic test validates calculation reliability

The system SHALL include a diagnostic test that validates consistency of impact calculations across multiple runs.

#### Scenario: Multiple runs produce consistent results
- **GIVEN** stable codebase state
- **WHEN** running impact calculation 5 times
- **THEN** all cyclomatic values are within ±5% of mean
- **AND** no single variance exceeds 10%

#### Scenario: Concurrent file modifications detected
- **GIVEN** impact calculation in progress
- **WHEN** file is modified mid-calculation
- **THEN** variance is detected and logged
- **AND** test reports non-deterministic behavior

---

### Requirement: Cache respects force refresh parameter

The system SHALL bypass cache entirely when force refresh is requested.

#### Scenario: Force refresh skips cache lookup
- **GIVEN** valid cache entry exists
- **WHEN** calling runScc(directory, force=true)
- **THEN** cache is not consulted
- **AND** SCC binary executes
- **AND** new results are cached

#### Scenario: Stale cache is marked and bypassed
- **GIVEN** cache entry marked stale for directory
- **WHEN** calling runScc(directory, force=false)
- **THEN** log `[scc:cache:miss] directory=/project reason=stale`
- **AND** SCC binary executes
- **AND** stale marker is cleared

---

### Requirement: Negative complexity values are validated

The system SHALL coerce negative complexity values to zero with warning.

#### Scenario: Negative SCC complexity coerced to zero
- **GIVEN** SCC reports negative complexity for a file
- **WHEN** parsing SCC output
- **THEN** log `[scc:parse:warn] negative_complexity path=file.ts value=-5`
- **AND** value is coerced to 0

---

### Requirement: Debug logging uses consistent format

The system SHALL use consistent structured logging format across all impact components.

#### Scenario: All logs use bracketed prefixes
- **GIVEN** DEBUG environment variable is set
- **WHEN** any impact calculation runs
- **THEN** all logs start with `[component:action]` format
- **AND** component is one of: scc, files, impact
- **AND** action provides specific context

#### Scenario: Logs are filterable by component
- **GIVEN** debug output contains mixed logs
- **WHEN** filtering with `grep "scc:"`
- **THEN** only SCC-related logs are returned
- **AND** files/impact logs are excluded
