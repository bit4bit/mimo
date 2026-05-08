## ADDED Requirements

### Requirement: ACP starts on request_state for a cold thread

When `request_state` arrives for a thread that has no active ACP client, the agent SHALL begin spawning an ACP process without blocking the `request_state` reply.

#### Scenario: spawn starts on request_state for cold thread

- **WHEN** `request_state` arrives for a thread with no ACP client
- **THEN** ACP process spawning begins asynchronously and the thread enters `"initializing"` state

#### Scenario: request_state reply not blocked by spawn

- **WHEN** `request_state` arrives for a cold thread
- **THEN** the agent does not await the ACP spawn before processing subsequent messages

#### Scenario: no duplicate spawn on rapid request_state

- **WHEN** two `request_state` messages arrive for the same cold thread in quick succession
- **THEN** only one ACP process is spawned

### Requirement: Prompts arriving during initializing state are queued

When a `user_message` arrives for a thread in `"initializing"` state, the prompt SHALL be queued and sent to ACP once the thread becomes `"active"`.

#### Scenario: prompt queued while initializing

- **WHEN** a `user_message` arrives while the thread is in `"initializing"` state
- **THEN** the prompt is held and sent to ACP after the ACP client becomes ready

#### Scenario: queued prompt sent after initialization completes

- **WHEN** ACP initialization completes for a thread with a queued prompt
- **THEN** the queued prompt is sent to ACP and the response flow proceeds normally
