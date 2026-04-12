## ADDED Requirements

### Requirement: Chat UI shows ACP status indicator
The system SHALL display the current ACP session status in the chat interface.

#### Scenario: Show active status
- **GIVEN** a session with active ACP connection
- **WHEN** the chat page loads or receives status update
- **THEN** the UI SHALL display an "active" indicator showing the ACP is connected
- **AND** the model and mode selectors SHALL be enabled

#### Scenario: Show parked status
- **GIVEN** a session with parked ACP connection
- **WHEN** the chat page loads or receives status update
- **THEN** the UI SHALL display a "parked" indicator (e.g., sleeping icon)
- **AND** a message SHALL indicate the agent is sleeping and will wake on next prompt
- **AND** the model and mode selectors SHALL remain visible but disabled

#### Scenario: Show waking status
- **GIVEN** a session transitioning from parked to active
- **WHEN** the user sends a prompt or resumption begins
- **THEN** the UI SHALL display a "waking" indicator (e.g., spinner)
- **AND** the input field SHALL be disabled with placeholder "Waking agent..."
- **AND** any queued messages SHALL show "waiting" state

### Requirement: WebSocket broadcasts ACP status changes
The system SHALL broadcast ACP status changes to all connected chat clients.

#### Scenario: Status broadcast on parking
- **GIVEN** an active ACP session
- **WHEN** the session parks due to idle timeout
- **THEN** the system SHALL broadcast to all chat WebSocket clients:
  ```json
  {
    "type": "acp_status",
    "status": "parked",
    "timestamp": "ISO8601"
  }
  ```

#### Scenario: Status broadcast on resumption
- **GIVEN** a parked ACP session
- **WHEN** resumption completes successfully
- **THEN** the system SHALL broadcast to all chat WebSocket clients:
  ```json
  {
    "type": "acp_status",
    "status": "active",
    "timestamp": "ISO8601"
  }
  ```

#### Scenario: Status broadcast during wake-up
- **GIVEN** a parked ACP session
- **WHEN** resumption begins (before ACP is ready)
- **THEN** the system SHALL broadcast to all chat WebSocket clients:
  ```json
  {
    "type": "acp_status",
    "status": "waking",
    "timestamp": "ISO8601"
  }
  ```

#### Scenario: Session reset notification
- **GIVEN** a session where `loadSession()` failed during resumption
- **WHEN** a new session is created instead
- **THEN** the system SHALL broadcast:
  ```json
  {
    "type": "acp_status",
    "status": "active",
    "sessionReset": true,
    "message": "Session expired - starting fresh",
    "timestamp": "ISO8601"
  }
  ```
- **AND** the UI SHALL display a transient notification with the message
