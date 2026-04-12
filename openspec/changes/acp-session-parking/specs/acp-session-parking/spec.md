## ADDED Requirements

### Requirement: ACP session parks after idle timeout
The system SHALL automatically park an ACP session when no activity has occurred for the configured idle timeout period.

#### Scenario: Session parks after idle timeout
- **WHEN** a session has been inactive for `idleTimeoutMs` milliseconds
- **THEN** the ACP process SHALL be terminated
- **AND** the file watcher SHALL be stopped
- **AND** the current `acpSessionId`, `modelState`, and `modeState` SHALL be cached to disk
- **AND** a status message SHALL be sent to all connected UI clients indicating "parked" state

#### Scenario: Activity resets idle timer
- **GIVEN** an active ACP session with activity tracking enabled
- **WHEN** any of the following events occur:
  - A user message is received from the platform
  - A `thought_start`, `thought_chunk`, or `thought_end` message is received from ACP
  - A `message_chunk` is received from ACP
  - A `usage_update` is received from ACP
- **THEN** the idle timer SHALL be reset to the full `idleTimeoutMs` duration

### Requirement: ACP session can be resumed transparently
The system SHALL transparently resume a parked ACP session when a new user prompt arrives.

#### Scenario: Session resumes on new prompt
- **GIVEN** a session in "parked" state with cached configuration
- **WHEN** a user prompt is received
- **THEN** the system SHALL spawn a new ACP process
- **AND** attempt to load the cached `acpSessionId` via `loadSession()`
- **AND** restore the cached `modelState` and `modeState`
- **AND** send the pending user prompt
- **AND** notify UI clients of "active" state

#### Scenario: Session resumption fails gracefully
- **GIVEN** a session in "parked" state
- **WHEN` a user prompt is received
- **AND** `loadSession()` fails or the cached session is no longer valid
- **THEN** a new ACP session SHALL be created via `newSession()`
- **AND** the cached `modelState` and `modeState` SHALL still be restored
- **AND** the user SHALL be notified that the session was reset
- **AND** the user prompt SHALL still be processed

### Requirement: Prompts queue during session wake-up
The system SHALL queue prompts that arrive while a session is waking from parked state.

#### Scenario: Multiple prompts during wake-up
- **GIVEN** a session in "waking" state
- **WHEN** multiple user prompts are received in quick succession
- **THEN** all prompts SHALL be queued in order
- **AND** prompts SHALL be processed sequentially after the ACP connection is established
- **AND** the UI SHALL show "waking" status until the first prompt is sent
