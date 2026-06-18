## ADDED Requirements

### Requirement: create_chat_thread Tool

The internal mimo MCP endpoint SHALL provide a `create_chat_thread` tool that
creates a new chat thread in the caller's session and seeds it with an initial
prompt. The new thread SHALL inherit the calling thread's `model`, `mode`, and
`assignedAgentId` unless the call overrides them.

#### Tool Description

- **WHEN** an ACP queries the tool list
- **THEN** the `create_chat_thread` tool description SHALL instruct the ACP to use
  it to start a new sibling chat thread that works in parallel, seeded with an
  initial prompt
- **AND** the input schema SHALL require `initialPrompt` (string)
- **AND** the input schema SHALL accept optional `title`, `model`, `mode`, and
  `assignedAgentId` string overrides

#### Scenario: Spawn with inherited settings

- **WHEN** an ACP calls `create_chat_thread` with `{ initialPrompt }` and no overrides
- **AND** the request carries a valid Bearer token and an `X-Mimo-Thread-Id` header
  resolving to a thread in that session
- **THEN** the endpoint SHALL create a new chat thread in the same session
- **AND** the new thread's `model`, `mode`, and `assignedAgentId` SHALL equal the
  calling thread's values
- **AND** the new thread SHALL be created with `acpSessionId` null and `state`
  "active"
- **AND** the tool SHALL return `{ success: true, threadId, name }`

#### Scenario: Spawn with overrides

- **WHEN** an ACP calls `create_chat_thread` with `initialPrompt` and one or more of
  `model`, `mode`, `assignedAgentId`
- **THEN** the provided override values SHALL be used for the new thread
- **AND** any field not overridden SHALL be inherited from the calling thread

#### Scenario: Agent override resolved by id or name

- **WHEN** `create_chat_thread` is called with `assignedAgentId` equal to an agent's
  id OR its name
- **THEN** the server SHALL resolve it to that agent and assign the agent's id to the
  new thread
- **AND** the model/mode SHALL be validated against that resolved agent

#### Scenario: Unknown agent override rejected

- **WHEN** an explicit `assignedAgentId` matches no agent (by id or name) owned by
  the session owner
- **THEN** the tool SHALL return an error naming the invalid agent and listing the
  valid agents, and SHALL NOT create a thread

#### Scenario: Model/mode validated against the target agent

- **WHEN** the resolved `model` (overridden or inherited) is not among the target
  agent's advertised models
- **THEN** the tool SHALL return an error result naming the invalid model and the
  valid models, and SHALL NOT create a thread
- **AND** the same validation SHALL apply to `mode`

#### Scenario: Agent advertises no capabilities

- **WHEN** the target agent has not advertised any models (e.g. never connected)
- **THEN** the server SHALL pass the requested `model` through unchanged
  (it cannot be validated)

#### Scenario: Initial prompt delivered as a user turn

- **WHEN** a thread is created via `create_chat_thread`
- **THEN** the platform SHALL send an `initial_prompt` message to the new thread's
  assigned agent with the `initialPrompt` content
- **AND** the new thread's ACP runtime SHALL be spawned if not already running
- **AND** the LLM SHALL receive the `initialPrompt` as a user turn and begin acting
  on it without further input

#### Scenario: Missing or unresolvable caller thread header

- **WHEN** an ACP calls `create_chat_thread` without an `X-Mimo-Thread-Id` header
- **OR** the `X-Mimo-Thread-Id` value does not resolve to a thread in the token's
  session
- **THEN** the tool SHALL return an error result and SHALL NOT create a thread

#### Scenario: Missing initial prompt

- **WHEN** an ACP calls `create_chat_thread` without a non-empty `initialPrompt`
- **THEN** the tool SHALL return `{ success: false, error: ... }` and SHALL NOT
  create a thread

### Requirement: Server-Side Unique Thread Naming

The endpoint SHALL set the new thread's name on the server. When the ACP supplies
an optional `title`, the server SHALL use it as the name source; otherwise it SHALL
derive the name from the initial prompt. In both cases the name SHALL be shortened
to a short, char-limited label and made unique within the session.

#### Scenario: Name derived from the prompt

- **WHEN** `create_chat_thread` is called with an `initialPrompt` and no `title`
- **THEN** the server SHALL derive the thread name from the leading portion of the
  initial prompt
- **AND** the name SHALL be persisted on the new thread

#### Scenario: Name from an explicit title

- **WHEN** `create_chat_thread` is called with a non-empty `title`
- **THEN** the server SHALL use the `title` as the thread name source instead of the
  initial prompt

#### Scenario: Title is char-limited

- **WHEN** a supplied `title` exceeds the short-name limit
- **THEN** the server SHALL shorten it to the limit before persisting

#### Scenario: Name collision within the session

- **WHEN** the derived name already exists for another thread in the session
- **THEN** the server SHALL adjust the name (e.g. append a numeric suffix) so it is
  unique within the session before creating the thread

#### Scenario: Empty derived name

- **WHEN** the initial prompt yields an empty or whitespace-only derived name
- **THEN** the server SHALL fall back to a generic unique default name

### Requirement: Spawned Thread Appears Live in Session UI

When a thread is created via `create_chat_thread`, the platform SHALL notify the
session's connected UI clients so the new thread appears without a page reload. The
notification SHALL NOT change which thread is active for those clients.

#### Scenario: Broadcast on creation

- **WHEN** `create_chat_thread` successfully creates a thread
- **THEN** the platform SHALL broadcast a `chat_thread_created` message to the
  session's WebSocket clients
- **AND** the message SHALL include the `sessionId` and the new thread's data (id,
  name, model, mode, assignedAgentId, state)

#### Scenario: Client appends the new thread tab

- **WHEN** a session UI client receives a `chat_thread_created` message
- **THEN** the client SHALL add the thread to its thread list and render the new tab
- **AND** the client SHALL NOT switch the active thread away from the user's current
  thread

#### Scenario: Failed creation is surfaced to the UI

- **WHEN** a `create_chat_thread` call fails for any reason (invalid model, mode,
  agent, missing argument, or unexpected error)
- **THEN** the tool SHALL return an error result
- **AND** the platform SHALL broadcast a `chat_thread_create_failed` message
  (with the error text) to the session's WebSocket clients
- **AND** the session UI client SHALL show the error as a notification

#### Scenario: Duplicate notification is ignored

- **WHEN** a session UI client receives a `chat_thread_created` message for a thread
  it already has in its list
- **THEN** the client SHALL NOT add a duplicate entry

### Requirement: list_thread_options Tool

The endpoint SHALL provide a `list_thread_options` tool that returns the override
values an ACP may supply to `create_chat_thread`. Each returned agent SHALL include
the models and modes that agent supports, so the ACP can choose a model/mode that is
valid for the chosen agent.

#### Scenario: Query available options

- **WHEN** an ACP calls `list_thread_options` with a valid Bearer token
- **THEN** the tool SHALL return the available agents, models, and modes that may be
  passed as overrides to `create_chat_thread`

#### Scenario: Per-agent valid models and modes

- **WHEN** `list_thread_options` returns the list of agents
- **THEN** each agent entry SHALL include that agent's supported models and modes
  (from its advertised capabilities)
- **AND** an agent that has not advertised capabilities SHALL report empty model and
  mode lists
