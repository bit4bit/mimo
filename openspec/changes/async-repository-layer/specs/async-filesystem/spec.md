## MODIFIED Requirements

### Requirement: Asynchronous file system operations

The FileSystem interface SHALL provide asynchronous methods for all file system operations. Production code paths in `mimo-platform` SHALL use the asynchronous methods. Synchronous methods SHALL remain available only for tests and legacy callers.

#### Scenario: Production code uses async file methods

- **WHEN** any production code in `mimo-platform` performs a file system operation through the `OS` abstraction
- **THEN** it SHALL call the `*Async` variant of the method

#### Scenario: Synchronous methods are deprecated for production use

- **WHEN** a developer writes new production code
- **THEN** they SHALL use the `*Async` methods and avoid the synchronous counterparts

### Requirement: No synchronous command execution

The CommandRunner interface SHALL NOT expose any synchronous command execution methods. All command execution SHALL be asynchronous.

#### Scenario: Running commands asynchronously

- **WHEN** `command.run(["echo", "hello"])` is called
- **THEN** it SHALL return a Promise resolving to the command result

#### Scenario: Spawning processes asynchronously

- **WHEN** `command.spawn(["long-running-process"])` is called
- **THEN** it SHALL return a SpawnedProcess with streaming I/O

### Requirement: Asynchronous ACP client state access

The AcpClient class SHALL provide asynchronous methods for accessing session state. Synchronous getters SHALL be removed.

#### Scenario: Getting ACP session ID asynchronously

- **WHEN** `client.getAcpSessionId()` is called
- **THEN** it SHALL return a Promise resolving to the session ID string

#### Scenario: Getting model state asynchronously

- **WHEN** `client.getModelState()` is called
- **THEN** it SHALL return a Promise resolving to the model state

#### Scenario: Getting mode state asynchronously

- **WHEN** `client.getModeState()` is called
- **THEN** it SHALL return a Promise resolving to the mode state

#### Scenario: Getting available commands asynchronously

- **WHEN** `client.getAvailableCommands()` is called
- **THEN** it SHALL return a Promise resolving to the command list
