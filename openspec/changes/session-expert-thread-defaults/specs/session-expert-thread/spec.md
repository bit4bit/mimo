## ADDED Requirements

### Requirement: Session creation accepts optional expert-mode agent and model

The session-creation form SHALL provide optional agent and model selects, labeled for expert mode. When the user selects an agent, the model select SHALL populate from that agent's cached capabilities. The mode SHALL auto-derive from the agent's `defaultModeId` and SHALL NOT be exposed as a form field.

#### Scenario: User provides expert agent and model at session creation

- **WHEN** the user creates a session and selects an agent "claude-pro" and model "claude-4-opus" in the expert-mode fields
- **THEN** the request to `POST /sessions` includes `expertAgentId: "claude-pro"`, `expertModelId: "claude-4-opus"`, and `expertModeId` derived from the agent's `defaultModeId`
- **AND** if the agent is online, a chat thread named "Expert" is created with those settings
- **AND** the new thread's id is stored as `activeExpertThreadId` on the session

#### Scenario: User omits expert-mode fields

- **WHEN** the user creates a session without selecting an expert agent
- **THEN** the request to `POST /sessions` omits the expert fields
- **AND** no expert thread is created
- **AND** `activeExpertThreadId` is null on the new session

#### Scenario: Selected agent is offline at session creation

- **WHEN** the user provides expert agent+model but the agent is not online at session-creation time
- **THEN** the session is created successfully
- **AND** no expert thread is created
- **AND** `activeExpertThreadId` is null on the new session
- **AND** the expert inputs are silently discarded (not persisted for retry)
- **AND** expert mode shows the existing "no thread" state until the user creates a thread via the normal flow

### Requirement: Auto-created expert thread is a normal chat thread

The auto-created "Expert" thread SHALL be a normal `ChatThread` with no role field, no badge, and no filtering. It SHALL appear in the chat-threads list and be usable for chat, rename, and delete. Deleting the expert thread SHALL clear `activeExpertThreadId` (set it to null) but SHALL NOT affect `activeChatThreadId`.

#### Scenario: Auto-created thread appears in chat-threads list

- **WHEN** the expert thread is auto-created at session boot
- **THEN** it appears in the chat-threads list alongside any other threads
- **AND** it has no visible marker distinguishing it from user-created threads
- **AND** the user can chat in it, rename it, and delete it

#### Scenario: User deletes the auto-created expert thread

- **WHEN** the user deletes the "Expert" thread
- **THEN** `activeExpertThreadId` is set to null
- **AND** `activeChatThreadId` is unchanged
- **AND** expert mode shows the "no thread" state

#### Scenario: Auto-created expert thread name collides with an existing thread

- **WHEN** the system attempts to create a thread named "Expert" at session boot
- **AND** a thread with that name already exists
- **THEN** the auto-create is skipped silently (the session still succeeds)
- **AND** `activeExpertThreadId` is null

### Requirement: Expert mode binds to the active expert thread

The expert-mode instruction input SHALL read `activeExpertThreadId` from the session, not `window.MIMO_CHAT_THREADS.getActiveThreadId()`. When `activeExpertThreadId` is null, the input SHALL show "Create a chat thread first" and be disabled.

#### Scenario: Expert mode with a configured expert thread

- **WHEN** `activeExpertThreadId` points at a valid thread
- **THEN** the instruction input is enabled
- **AND** messages are routed to that thread's ACP runtime
- **AND** the thread name is displayed in the expert-mode context bar

#### Scenario: Expert mode with no expert thread

- **WHEN** `activeExpertThreadId` is null
- **THEN** the instruction input is disabled
- **AND** the input shows "Create a chat thread first"
- **AND** the user can use the normal `+` flow to create any thread; doing so does NOT set `activeExpertThreadId`

### Requirement: Active expert thread pointer is independent from active chat thread

`activeExpertThreadId` and `activeChatThreadId` SHALL be independent. Switching the active chat thread SHALL NOT change `activeExpertThreadId`. The MCP `create_chat_thread` inheritance and the chat-side `new-thread-prefill` SHALL continue to key off `activeChatThreadId` only.

#### Scenario: Chat and expert point at different threads

- **WHEN** a session has two threads "A" and "B"
- **AND** `activeChatThreadId` is set to "A"
- **AND** `activeExpertThreadId` is set to "B"
- **THEN** chat messages go to thread "A"
- **AND** expert-mode instructions go to thread "B"
- **AND** activating thread "B" on the chat side does NOT change `activeExpertThreadId`

#### Scenario: MCP thread inheritance uses chat pointer only

- **WHEN** an MCP tool calls `create_chat_thread` and the active chat thread is "A"
- **THEN** the new thread inherits model/mode/agent from thread "A"
- **AND** the new thread does NOT inherit from `activeExpertThreadId`