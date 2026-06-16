## ADDED Requirements

### Requirement: Session initialization avoids full recursive scans

The system SHALL initialize file sync for a session without recursively scanning the entire upstream or session worktree.

#### Scenario: Create session in large repository

- **WHEN** a new session is created for a project with 100,000 files
- **THEN** the session becomes ready without reading every file
- **AND** the initial changeset is empty

### Requirement: Baseline checksums are computed on first access

The system SHALL record the original checksum of a file only when the agent reports a change to that file.

#### Scenario: Agent modifies a single file

- **WHEN** agent reports a change to "src/app.js"
- **THEN** the system reads the upstream version of "src/app.js" once
- **AND** stores its checksum as the baseline
- **AND** proceeds with normal conflict detection

### Requirement: Manual full baseline scan remains available

The system SHALL provide an explicit operation to build a complete baseline when the user requests it.

#### Scenario: User requests full sync baseline

- **WHEN** the user triggers a full baseline refresh
- **THEN** the system recursively scans both worktrees
- **AND** records baseline checksums for all files

### Requirement: Lazy sync preserves conflict detection semantics

The system SHALL still detect conflicts for any file that the agent touches, using the recorded baseline.

#### Scenario: Upstream changed before agent edit

- **WHEN** the upstream version of "src/app.js" differs from the recorded baseline
- **AND** the agent workspace version also differs from the baseline
- **THEN** the system marks "src/app.js" as conflict
- **AND** requires manual resolution
