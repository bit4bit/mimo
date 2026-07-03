## ADDED Requirements

### Requirement: Chat WebSocket heartbeat

The chat WebSocket SHALL run an application-level heartbeat so that dead or half-open connections are detected and recovered rather than silently dropping agent responses.

#### Scenario: Client sends periodic ping

- **WHEN** the chat WebSocket connection opens
- **THEN** the client SHALL start an interval that sends a `{ type: "ping" }` message at a fixed heartbeat interval
- **AND** the client SHALL clear any previous heartbeat interval before starting a new one

#### Scenario: Server responds to ping with pong

- **WHEN** the server receives a `{ type: "ping" }` message on a chat WebSocket
- **THEN** the server SHALL reply with a `{ type: "pong" }` message on the same connection

#### Scenario: Client tracks liveness from pong

- **WHEN** the client receives a `{ type: "pong" }` message
- **THEN** the client SHALL record the connection as alive as of that time

#### Scenario: Heartbeat interval is cleared on close

- **WHEN** the chat WebSocket connection closes
- **THEN** the client SHALL clear the heartbeat interval so no timers leak across reconnects

### Requirement: Zombie connection detection and reconnect

The client SHALL treat a connection that stops responding to heartbeats as dead and force a reconnect, so that a half-open socket cannot silently swallow the agent response.

#### Scenario: Missed pongs force a reconnect

- **WHEN** the client has sent pings but has not received a pong within the missed-pong limit
- **THEN** the client SHALL treat the socket as dead
- **AND** the client SHALL call `close()` on the socket
- **AND** the existing reconnect path SHALL establish a new connection

#### Scenario: Reconnect reconciles missed response from history

- **WHEN** the chat WebSocket reconnects after a dead-socket close
- **THEN** the client SHALL receive the active thread's `history` and reconcile it into the view
- **AND** an assistant response that completed while the socket was dead SHALL become visible without a manual page reload

### Requirement: History reconciliation on reconnect

On reconnection the client SHALL explicitly request a history replay for its active thread, independent of the server's proactive history push.

#### Scenario: Reconnect requests replay for the client's active thread

- **WHEN** the chat WebSocket connection re-opens
- **THEN** the client SHALL send a `request_replay` message including its current active `chatThreadId`
- **AND** the resulting `history` SHALL be loaded even if the server's proactive `open`-handler history push targeted a different active thread

#### Scenario: Double history load does not duplicate messages

- **WHEN** the client receives `history` from both the server's proactive push and its own `request_replay` on the same reconnect
- **THEN** loading history SHALL wipe and rebuild the message view
- **AND** no message SHALL be rendered twice
