## MODIFIED Requirements

### Requirement: Agent connects successfully
The system SHALL allow agent to establish WebSocket connection and receive thread-aware runtime information.

#### Scenario: Agent receives chat-thread metadata on connect
- **WHEN** mimo-agent connects via WebSocket with valid token
- **AND** assigned session has 2 chat threads
- **THEN** system sends session bootstrap with both chat threads
- **AND** each thread includes `chatThreadId`, `model`, `mode`, and `acpSessionId`

### Requirement: Agent maintains multi-session state
The system SHALL allow agent to manage multiple concurrent runtimes per session using chat-thread keys.

#### Scenario: Agent tracks runtime by session and thread
- **WHEN** agent initializes a session with threads `t1` and `t2`
- **THEN** agent stores runtime entries keyed by `{sessionId, chatThreadId}`
- **AND** each entry stores checkoutPath, ACP process, and ACP session identifier

#### Scenario: Agent routes prompts to the correct thread runtime
- **WHEN** platform sends user_message with `sessionId` and `chatThreadId=t2`
- **THEN** agent forwards prompt only to runtime `{sessionId, t2}`
- **AND** no other thread runtime receives that prompt

### Requirement: Agent restores thread model and mode
The system SHALL restore each thread runtime using the thread's persisted model and mode.

#### Scenario: Wake parked thread runtime
- **WHEN** thread runtime transitions from `PARKED` to `WAKING`
- **THEN** agent initializes or loads ACP session for that thread
- **AND** agent applies thread `model` and `mode` before draining queued prompts
