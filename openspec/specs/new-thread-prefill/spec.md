# new-thread-prefill Specification

## Purpose
TBD - created by archiving change prefill-new-thread-from-active. Update Purpose after archive.
## Requirements
### Requirement: Prefill form from active thread
When the create-thread dialog opens and there is a currently active thread with an assigned agent that is present in the online agents list, the dialog SHALL pre-select the active thread's agent, model, and mode.

#### Scenario: Active thread with online agent
- **WHEN** the user clicks "+" to create a new thread
- **AND** there is an active thread with `assignedAgentId` set
- **AND** that agent appears in the online agents list
- **THEN** the agent dropdown SHALL be pre-selected to that agent
- **AND** the model and mode selects SHALL be populated from that agent's capabilities
- **AND** the model matching the active thread's model SHALL be pre-selected
- **AND** the mode matching the active thread's mode SHALL be pre-selected

#### Scenario: Active thread with offline agent
- **WHEN** the user clicks "+" to create a new thread
- **AND** there is an active thread whose `assignedAgentId` is NOT in the online agents list
- **THEN** the form SHALL open with no prefilling (blank agent, model shows "Select an agent first", mode shows "Select an agent first")

#### Scenario: No active thread
- **WHEN** the user clicks "+" to create a new thread
- **AND** there is no active thread
- **THEN** the form SHALL open with no prefilling (current behavior)

### Requirement: Name and instructions are not prefilled
The thread name field and instructions field SHALL NOT be prefilled from the active thread regardless of whether other fields are prefilled.

#### Scenario: Name field stays empty
- **WHEN** the create-thread dialog opens with prefilled agent/model/mode
- **THEN** the name input SHALL be empty and focused

#### Scenario: Instructions use default
- **WHEN** the create-thread dialog opens with prefilled agent/model/mode
- **THEN** the instructions textarea SHALL contain `window.MIMO_DEFAULT_INSTRUCTIONS` (same as today)

### Requirement: Race condition safety during prefill
If the user changes the agent dropdown while the prefill capabilities fetch is in flight, the in-flight prefill response SHALL be discarded and only the user's chosen agent capabilities SHALL be applied.

#### Scenario: User overrides prefilled agent before capabilities load
- **WHEN** the dialog opens and begins fetching capabilities for the prefilled agent
- **AND** the user selects a different agent before the fetch completes
- **THEN** the prefill fetch result SHALL be ignored
- **AND** the model and mode selects SHALL reflect the user-selected agent's capabilities only

