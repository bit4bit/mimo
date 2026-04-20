## MODIFIED Requirements

### Requirement: Session has a priority

The system SHALL store a priority on every session. Priority is one of `"high"`, `"medium"`, or `"low"`. Sessions created without an explicit priority default to `"medium"`. Sessions read from storage without a priority field are treated as `"medium"`.

#### Scenario: Create session with high priority
- **WHEN** user submits session creation form with priority "high"
- **THEN** system stores session with `priority: "high"`
- **AND** system returns session with `priority: "high"`

#### Scenario: Create session without priority defaults to medium
- **WHEN** user submits session creation form without specifying priority
- **THEN** system stores session with `priority: "medium"`

#### Scenario: Create session with invalid priority rejected
- **WHEN** user submits session creation form with priority "urgent"
- **THEN** system returns 400 validation error
- **AND** system does not create session record

#### Scenario: Update session priority via settings
- **WHEN** user submits session settings form with priority "low"
- **THEN** system updates session `priority` to `"low"`
- **AND** subsequent list response reflects updated priority in sort order

#### Scenario: Existing session without priority field reads as medium
- **WHEN** session.yaml exists without a `priority` field
- **THEN** system reads session with `priority: "medium"`
- **AND** system does not error or reject the session

### Requirement: Session list sorted by priority then recency

The system SHALL return sessions sorted by priority descending (high first, then medium, then low), with `createdAt` descending as a tiebreaker within the same priority.

#### Scenario: High priority session appears before medium in list
- **GIVEN** session A created first with priority "medium"
- **AND** session B created second with priority "high"
- **WHEN** user requests session list
- **THEN** session B (high) appears before session A (medium)

#### Scenario: Within same priority, newer session appears first
- **GIVEN** session A created first with priority "high"
- **AND** session B created second with priority "high"
- **WHEN** user requests session list
- **THEN** session B (newer) appears before session A (older)

#### Scenario: Low priority session appears last
- **GIVEN** sessions with priorities high, medium, low (created in that order)
- **WHEN** user requests session list
- **THEN** order is: high → medium → low
