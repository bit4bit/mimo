## MODIFIED Requirements

### Requirement: scc execution
The system SHALL execute scc on directories to extract complexity metrics.

#### Scenario: Run scc on workspace
- **WHEN** calculating impact metrics
- **THEN** execute scc --by-file --format json on the changed file paths
- **AND** merge the result with the cached baseline metrics
- **AND** only execute scc on the full workspace and upstream directories when explicitly requested

#### Scenario: Run scc on full directories for baseline
- **WHEN** a full impact refresh is requested
- **THEN** execute scc --by-file --format json on agent-workspace/
- **AND** execute scc --by-file --format json on upstream/
- **AND** store the result as the cached baseline

### Requirement: scc result caching
The system SHALL cache scc results for 5 seconds to avoid repeated scanning.

#### Scenario: Cache hit
- **WHEN** impact metrics are requested within 5 seconds of previous request
- **THEN** return cached scc results
- **AND** do not re-execute scc

#### Scenario: Cache miss with incremental run
- **WHEN** impact metrics are requested and cache is expired
- **AND** only a subset of files changed
- **THEN** execute scc on the changed files
- **AND** merge with the cached baseline
- **AND** store the merged result in the cache

### Requirement: scc error handling
The system SHALL handle scc failures gracefully.

#### Scenario: scc execution timeout
- **WHEN** scc execution exceeds 30 seconds
- **THEN** cancel the scan
- **AND** display warning: "scc scan timed out - showing file counts only"
- **AND** continue with file count metrics

#### Scenario: Incremental scc run times out
- **WHEN** an incremental scc run on a small set of files times out
- **THEN** the system marks the impact metrics as stale
- **AND** falls back to file count metrics
- **AND** does not block subsequent refreshes
