## MODIFIED Requirements

### Requirement: Each chat thread stores model and mode

The system SHALL persist model, mode, and brain-wash state at chat-thread level.

#### Scenario: Different model, mode, and brain-wash per thread

- **WHEN** user configures `Main` with model "gpt-5", mode "code", brain-wash enabled
- **AND** configures `Reviewer` with model "claude-4", mode "review", brain-wash disabled
- **THEN** system stores all configurations independently
- **AND** updating one thread SHALL NOT mutate the other thread
