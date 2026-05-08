## ADDED Requirements

### Requirement: Router dispatches agent messages to typed handlers

The `AgentMessageRouter` SHALL route each incoming agent message type to a dedicated private handler method, with all dependencies injected at construction time and no module-level singletons.

#### Scenario: thought_start delegated to pipeline

- **WHEN** the router receives a `thought_start` message with a `sessionId` and `chatThreadId`
- **THEN** `ChatStreamingPipeline.handleThoughtStart` is called with those values

#### Scenario: usage_update delegated to pipeline and triggers auto-sync

- **WHEN** the router receives a `usage_update` message
- **THEN** `ChatStreamingPipeline.handleUsageUpdate` is awaited and `triggerAutoSync` is called with reason `"usage_update"`

#### Scenario: session_initialized persists model and mode state

- **WHEN** the router receives a `session_initialized` message with `modelState` and `modeState`
- **THEN** `sessionRepository.update` is called to persist both states and `broadcast` emits `session_initialized` to UI clients

### Requirement: Router deduplicates concurrent auto-sync calls

The `AgentMessageRouter` SHALL track in-flight auto-sync operations per session and skip duplicate triggers while one is already running.

#### Scenario: second auto-sync skipped while first in flight

- **WHEN** an auto-sync is already in progress for a session and a second trigger arrives for the same session
- **THEN** the second trigger is ignored and only one sync runs

### Requirement: Router forwards permission requests to UI and resolves on response

The `AgentMessageRouter` SHALL relay `permission_request` messages from the agent to the corresponding UI clients and resolve the pending promise when `permission_response` arrives.

#### Scenario: permission_request broadcast to UI

- **WHEN** the router receives a `permission_request` with a `requestId`
- **THEN** a `permission_request` message is broadcast to the session's UI clients and the `requestId` is tracked as pending

#### Scenario: permission_response resolves pending request

- **WHEN** the router receives a `permission_response` with a matching `requestId`
- **THEN** the pending permission promise is resolved with the `outcome` value

### Requirement: Router debounces session activity touches

The `AgentMessageRouter` SHALL debounce calls to `sessionRepository.touchSessionActivity` for activity event types (`thought_start`, `thought_chunk`, `thought_end`, `message_chunk`, `usage_update`) with a 30-second debounce window per session.

#### Scenario: rapid activity events produce one DB touch

- **WHEN** five `thought_chunk` messages arrive for the same session within 1 second
- **THEN** `sessionRepository.touchSessionActivity` is called at most once within the debounce window
