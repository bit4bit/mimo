## MODIFIED Requirements

### Requirement: R9 Impact Buffer
The Impact buffer SHALL display impact metrics including files, LOC, complexity, AND code duplication.

#### Scenario: Display all metrics
- **WHEN** the ImpactBuffer renders with metrics
- **THEN** it SHALL display:
  - Files section (new, changed, deleted)
  - Lines of Code section (added, removed, net)
  - Complexity section (cyclomatic, cognitive, estimated time)
  - Code Duplication section (duplicated lines, percentage, blocks)
- **AND** each section SHALL be clearly separated

#### Scenario: Duplication section visibility
- **WHEN** duplication metrics are available
- **THEN** the Code Duplication section SHALL be visible
- **AND** it SHALL display after the Complexity section
- **AND** it SHALL follow the same styling patterns as other sections

#### Scenario: Empty duplication state
- **WHEN** no duplication is detected
- **THEN** the Code Duplication section SHALL either:
  - Display "No duplication detected" message, OR
  - Be collapsed/hidden with an indicator that duplication is clean
