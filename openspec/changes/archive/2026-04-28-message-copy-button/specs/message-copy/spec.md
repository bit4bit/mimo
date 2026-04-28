## ADDED Requirements

### Requirement: Message copy button
The system SHALL display a copy button in each message bubble header, inline with the role label ("Agent" or "You"), positioned to the right.

#### Scenario: User copies an agent message
- **WHEN** user clicks the copy button on an agent message bubble
- **THEN** the message content text is copied to the system clipboard

#### Scenario: User copies a user message
- **WHEN** user clicks the copy button on a user ("You") message bubble
- **THEN** the message content text is copied to the system clipboard

#### Scenario: Copy button is always visible
- **WHEN** user views the chat session page
- **THEN** all copy buttons are visible without requiring hover or any other interaction
