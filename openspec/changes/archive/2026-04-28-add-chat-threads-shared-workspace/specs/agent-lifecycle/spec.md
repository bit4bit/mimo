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

### Requirement: Idle timeout is session-scoped
The system SHALL use a single idle timer per session, reset by activity on any thread.

#### Scenario: Activity on one thread keeps all threads alive
- **WHEN** session has threads `t1` (active) and `t2` (active)
- **AND** user sends a prompt to `t1`
- **THEN** session-level idle timer resets
- **AND** `t2` is NOT parked due to `t1` inactivity

#### Scenario: Session parks all threads when idle
- **WHEN** no prompt is received on any thread for `idleTimeoutMs`
- **THEN** agent parks ALL active thread runtimes in the session
- **AND** each parked thread stores its `acpSessionId` for later resume

#### Scenario: Incoming prompt wakes only the targeted thread
- **WHEN** session has threads `t1` (parked) and `t2` (parked)
- **AND** user sends a prompt to `t2`
- **THEN** agent transitions only `t2` from `PARKED` to `WAKING`
- **AND** `t1` remains `PARKED`
- **AND** session-level idle timer restarts once `t2` is `ACTIVE`
