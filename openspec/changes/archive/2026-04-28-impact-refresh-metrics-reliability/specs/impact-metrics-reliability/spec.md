## ADDED Requirements

### Requirement: Impact refresh metrics SHALL be deterministic for unchanged content
The system SHALL return identical impact metrics for repeated refresh requests when upstream and workspace source content are unchanged.

#### Scenario: Repeated forced refresh with unchanged files
- **WHEN** impact refresh is requested repeatedly with force refresh and no file content changes
- **THEN** file counts, LOC metrics, and complexity metrics SHALL remain identical across runs

### Requirement: Impact calculation SHALL exclude generated and runtime artifacts
The system SHALL exclude generated/runtime artifacts from changed-file detection and metric computation so refresh results reflect only source changes.

#### Scenario: Runtime artifact appears between refreshes
- **WHEN** a runtime or measurement artifact file is created in excluded paths between two refreshes
- **THEN** impact file counts, LOC, and complexity values SHALL remain unchanged

### Requirement: Impact payload SHALL satisfy metric invariants
The system SHALL validate metric consistency before emitting updated impact results.

#### Scenario: Complexity delta invariant
- **WHEN** impact results are produced
- **THEN** `complexity.cyclomatic` SHALL equal `absoluteComplexity.workspace - absoluteComplexity.upstream`

#### Scenario: LOC net invariant
- **WHEN** impact results are produced
- **THEN** `linesOfCode.net` SHALL equal `linesOfCode.added - linesOfCode.removed`

### Requirement: Impact refresh SHALL expose validation status and run metadata
The system SHALL include additive diagnostic metadata in impact refresh responses to support traceability and debugging.

#### Scenario: Validation metadata on successful refresh
- **WHEN** a refresh succeeds and invariants pass
- **THEN** the response SHALL include run metadata and a validation status indicating success

#### Scenario: Validation metadata on invariant failure
- **WHEN** a refresh produces metrics that violate invariants
- **THEN** the response SHALL include a validation warning status and diagnostic details without removing existing metric fields
