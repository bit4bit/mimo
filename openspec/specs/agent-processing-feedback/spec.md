## ADDED Requirements

### Requirement: Agent emits prompt_received confirmation
When the mimo-agent receives a `user_message` and has an active ACP client for the session, it SHALL emit a `prompt_received` event to the platform before invoking the ACP provider.

#### Scenario: Agent has active ACP client
- **WHEN** the mimo-agent receives a `user_message` for a session that has an active `acpClient`
- **THEN** the agent sends `{ type: 'prompt_received', sessionId, timestamp }` to the platform before calling `acpClient.prompt()`

#### Scenario: Agent has no ACP client
- **WHEN** the mimo-agent receives a `user_message` for a session with no active `acpClient`
- **THEN** the agent does NOT send `prompt_received` and sends `error_response` instead (existing behavior preserved)

### Requirement: Platform forwards prompt_received to chat clients
When the platform receives `prompt_received` from an agent, it SHALL broadcast it to all chat WebSocket clients subscribed to that session.

#### Scenario: Chat clients connected
- **WHEN** the platform receives `prompt_received` from an agent for sessionId X
- **THEN** all open chat WebSocket connections for session X receive `{ type: 'prompt_received', sessionId: X }`

#### Scenario: No chat clients connected
- **WHEN** the platform receives `prompt_received` and no chat clients are subscribed to that session
- **THEN** the event is silently discarded (no error)

### Requirement: Chat UI shows waiting indicator in agent message element
When the browser receives `prompt_received`, the chat UI SHALL create the agent message element immediately with a "waiting" indicator, before any `thought_start` or `message_chunk` arrives.

#### Scenario: prompt_received before thought_start
- **WHEN** the browser receives `prompt_received`
- **THEN** an agent message element appears in the chat with a blinking "●" waiting indicator
- **AND** `currentMessageElement` is set to this element so subsequent events reuse it

#### Scenario: thought_start after prompt_received
- **WHEN** `thought_start` arrives and `currentMessageElement` already exists (created by `prompt_received`)
- **THEN** the waiting indicator is replaced by the "Thinking..." section inside the existing element
- **AND** no new agent message element is created

#### Scenario: message_chunk after prompt_received (no thought_start)
- **WHEN** `message_chunk` arrives and `currentMessageElement` already exists
- **THEN** the response content is appended inside the existing element
- **AND** no new agent message element is created

#### Scenario: error after prompt_received
- **WHEN** an `error` event arrives after `prompt_received` but before `thought_start`
- **THEN** the waiting indicator is removed and the error message is shown
- **AND** `currentMessageElement` is reset to null
