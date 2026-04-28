## ADDED Requirements

### Requirement: Editable YOU bubble replaces bottom input form
The system SHALL remove the static `#chat-form` HTML from the server-rendered page and instead create dynamically a "YOU" editable bubble at the end of `#chat-messages` via JavaScript.

#### Scenario: Page load with no history
- **WHEN** the session page loads and there are no chat messages
- **THEN** an editable YOU bubble appears at the bottom of the chat area

#### Scenario: Page load with history ending in agent message
- **WHEN** the session page loads and the last message in history is from the agent
- **THEN** an editable YOU bubble appears at the bottom of the chat area

#### Scenario: Page load with history ending in user message
- **WHEN** the session page loads and the last message in history is from the user (agent has not yet responded)
- **THEN** no editable YOU bubble is shown until `usage_update` is received

### Requirement: Editable bubble header contains connection status and send button
The editable YOU bubble's header SHALL display: the label "YOU", a connection status indicator `●`, and a `[⌃↵ Send]` button.

#### Scenario: Connected state
- **WHEN** the WebSocket connection is open
- **THEN** the `●` indicator in the editable bubble header is styled as connected (green)

#### Scenario: Disconnected state
- **WHEN** the WebSocket connection is closed or errored
- **THEN** the `●` indicator in the editable bubble header is styled as disconnected

#### Scenario: Send button click
- **WHEN** the user clicks the `[⌃↵ Send]` button in the header
- **THEN** the message is sent (same behavior as Ctrl+Enter)

### Requirement: Multiline input with Ctrl+Enter to send
The editable YOU bubble SHALL use a `contenteditable` div that supports multiline input. Pressing `Ctrl+Enter` SHALL send the message. Pressing `Enter` alone SHALL insert a newline.

#### Scenario: Single line send
- **WHEN** the user types a message and presses Ctrl+Enter
- **THEN** the message is sent and the editable bubble becomes read-only

#### Scenario: Multiline entry
- **WHEN** the user presses Enter (without Ctrl)
- **THEN** a new line is inserted in the contenteditable div and no message is sent

#### Scenario: Empty message ignored
- **WHEN** the user presses Ctrl+Enter or clicks Send with no content
- **THEN** nothing happens (no message sent)

### Requirement: Plain text paste stripping
When pasting content into the editable bubble, the system SHALL strip any HTML formatting and insert only plain text.

#### Scenario: Paste from rich source
- **WHEN** the user pastes HTML-formatted content (e.g., from a browser)
- **THEN** only the plain text representation is inserted into the editable div

### Requirement: Editable bubble lifecycle tied to agent response
After sending a message, the editable YOU bubble SHALL become a regular read-only message. A new editable bubble SHALL appear only after the agent's `usage_update` event (end of response).

#### Scenario: After sending
- **WHEN** the user sends a message (Ctrl+Enter or click)
- **THEN** the editable bubble is converted to a read-only YOU message
- **AND** no new editable bubble appears until the agent finishes responding

#### Scenario: After agent responds
- **WHEN** `usage_update` is received (agent finished responding)
- **THEN** a new editable YOU bubble appears at the bottom of the chat

## REMOVED Requirements

### Requirement: Static bottom input form
**Reason**: Replaced by the inline editable YOU bubble created dynamically by chat.js.
**Migration**: The `#chat-form`, `#chat-input`, `.chat-connection-status` DOM elements no longer exist. Any code referencing them must be updated to use the new editable bubble.
