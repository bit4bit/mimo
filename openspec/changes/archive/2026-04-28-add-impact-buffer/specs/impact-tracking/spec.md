## ADDED Requirements

### Requirement: Real-time impact metrics
The system SHALL calculate and display file impact metrics in real-time, comparing agent-workspace against upstream.

#### Scenario: Calculate file counts
- **WHEN** the Impact buffer is loaded or refreshed
- **THEN** the system SHALL scan both upstream/ and agent-workspace/ directories
- **AND** calculate new files (in workspace, not in upstream)
- **AND** calculate changed files (in both, different checksum)
- **AND** calculate deleted files (in upstream, not in workspace)

### Requirement: Trend indicators
The system SHALL display trend indicators (↑ ↓ →) showing velocity of changes compared to previous scan.

#### Scenario: Show increasing trend
- **WHEN** new file count increases from previous scan
- **THEN** display "↑" indicator next to new file count

#### Scenario: Show decreasing trend
- **WHEN** changed file count decreases from previous scan
- **THEN** display "↓" indicator next to changed file count

#### Scenario: Show stable trend
- **WHEN** deleted file count matches previous scan
- **THEN** display "→" indicator next to deleted file count

### Requirement: Lines of Code tracking
The system SHALL track lines of code changes between upstream and agent-workspace.

#### Scenario: Calculate LOC metrics
- **WHEN** the Impact buffer displays metrics
- **THEN** show total lines added (new + modified additions)
- **AND** show total lines removed (deleted + modified removals)
- **AND** show net LOC change (added - removed)
- **AND** display trend indicators for each metric

### Requirement: 5-second polling
The system SHALL auto-refresh impact metrics every 5 seconds while the session page is active.

#### Scenario: Poll for updates
- **WHEN** user is on the session detail page
- **THEN** the client SHALL poll /sessions/:id/impact every 5 seconds
- **AND** update the Impact buffer with fresh metrics

### Requirement: Two-buffer layout
The system SHALL display only Chat (center) and Impact (right) buffers, removing the Changes buffer.

#### Scenario: View session detail
- **WHEN** user navigates to a session detail page
- **THEN** display the Chat buffer in the center
- **AND** display the Impact buffer on the right
- **AND** the Changes buffer SHALL NOT be visible

### Requirement: Fossil web integration
The system SHALL provide links to the fossil web interface for the current session.

#### Scenario: View fossil timeline
- **WHEN** user clicks "Timeline" link in Impact buffer
- **THEN** open fossil web timeline in a new tab

#### Scenario: View fossil diff
- **WHEN** user clicks "Diff" link in Impact buffer
- **THEN** open fossil web diff view in a new tab

#### Scenario: View fossil files
- **WHEN** user clicks "Files" link in Impact buffer
- **THEN** open fossil web file browser in a new tab

## MODIFIED Requirements

### Requirement: Session UI displays buffers
The SessionDetailPage SHALL display the Chat buffer and Impact buffer.

#### Scenario: Render session detail
- **WHEN** the system renders the SessionDetailPage
- **THEN** the Chat buffer SHALL occupy the center position
- **AND** the Impact buffer SHALL occupy the right position
- **AND** no Changes buffer SHALL be rendered
