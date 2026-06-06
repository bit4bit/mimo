## ADDED Requirements

### Requirement: Thread creation preserves existing idle timeout
When the platform notifies an agent of a new chat thread via `session_ready`, the payload SHALL include the session's current `idleTimeoutMs` so the agent does not revert to the default value.

#### Scenario: Thread creation after custom idle timeout set
- **GIVEN** a session with `idleTimeoutMs` set to `1800000` (30 minutes)
- **WHEN** a new chat thread is created and the platform sends `session_ready` to the assigned agent
- **THEN** the `session_ready` payload contains `idleTimeoutMs: 1800000`
- **AND** the agent's cached idle timeout remains `1800000`

#### Scenario: Thread creation with idle timeout disabled
- **GIVEN** a session with `idleTimeoutMs` set to `0` (disabled)
- **WHEN** a new chat thread is created and the platform sends `session_ready` to the assigned agent
- **THEN** the `session_ready` payload contains `idleTimeoutMs: 0`
- **AND** the agent's cached idle timeout remains `0`

## MODIFIED Requirements

### Requirement: Agent handles session_ready without reverting defaults
The agent SHALL only update its cached `idleTimeoutMs` when the `session_ready` payload explicitly provides the field.

#### Scenario: session_ready omits idleTimeoutMs
- **GIVEN** the agent has an existing `idleTimeoutMs` cache entry of `120000`
- **WHEN** a `session_ready` message arrives that does not contain `idleTimeoutMs`
- **THEN** the agent keeps the existing `120000` value
- **AND** does not fall back to the `600000` default

