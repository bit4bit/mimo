## ADDED Requirements

### Requirement: Agent emits prompt_completed when prompt resolves
When the mimo-agent's call to `acpClient.prompt()` resolves (either successfully or with error), it SHALL emit a `prompt_completed` event to the platform.

#### Scenario: Successful prompt completion
- **WHEN** `acpClient.prompt(content)` resolves successfully
- **THEN** the agent sends `{ type: 'prompt_completed', sessionId, chatThreadId, timestamp }` to the platform

#### Scenario: Prompt errors
- **WHEN** `acpClient.prompt(content)` rejects with an error
- **THEN** the agent sends `{ type: 'prompt_completed', sessionId, chatThreadId, timestamp }` to the platform BEFORE sending `error_response`
- **AND** the platform treats this as the end of the stream

### Requirement: Platform forwards prompt_completed to chat clients
When the platform receives `prompt_completed` from an agent, it SHALL broadcast it to all chat WebSocket clients subscribed to that session, passing through the `chatThreadId`.

#### Scenario: Chat clients connected
- **WHEN** the platform receives `prompt_completed` from an agent for sessionId X and threadId Y
- **THEN** all open chat WebSocket connections for session X receive `{ type: 'prompt_completed', sessionId: X, chatThreadId: Y }`

#### Scenario: No chat clients connected
- **WHEN** the platform receives `prompt_completed` and no chat clients are subscribed
- **THEN** the event is silently discarded

### Requirement: Chat UI finalizes streaming message on prompt_completed
When the browser receives `prompt_completed`, the chat UI SHALL call `finalizeMessageStream()` to remove the streaming indicator, render the final content, and restore the editable input bubble.

#### Scenario: prompt_completed after usage_update
- **WHEN** the browser receives `prompt_completed` after one or more `usage_update` events
- **THEN** the streaming indicator is removed
- **AND** the accumulated content is rendered
- **AND** the editable bubble reappears

#### Scenario: prompt_completed without usage_update
- **WHEN** the browser receives `prompt_completed` without any preceding `usage_update`
- **THEN** the streaming message is finalized without usage metadata
- **AND** the editable bubble reappears
