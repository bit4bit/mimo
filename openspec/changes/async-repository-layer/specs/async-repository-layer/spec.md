## ADDED Requirements

### Requirement: Repository methods are asynchronous

All domain repository methods that perform filesystem I/O SHALL return a `Promise` and SHALL use the asynchronous `OS` filesystem methods. Synchronous filesystem calls SHALL NOT be used in production code paths.

#### Scenario: Creating a session does not block concurrent requests

- **WHEN** `SessionRepository.create()` is called
- **THEN** it SHALL return a `Promise` and SHALL use `os.fs.mkdirAsync` and `os.fs.writeFileAsync`

#### Scenario: Reading a session does not block concurrent requests

- **WHEN** `SessionRepository.findById()` is called
- **THEN** it SHALL return a `Promise` and SHALL use `os.fs.existsAsync` and `os.fs.readFileAsync`

#### Scenario: Listing sessions does not block concurrent requests

- **WHEN** `SessionRepository.listByProject()` is called
- **THEN** it SHALL return a `Promise` and SHALL read session files asynchronously

#### Scenario: Updating a session does not block concurrent requests

- **WHEN** `SessionRepository.update()` is called
- **THEN** it SHALL return a `Promise` and SHALL use `os.fs.writeFileAsync`

#### Scenario: Deleting a session does not block concurrent requests

- **WHEN** `SessionRepository.delete()` is called
- **THEN** it SHALL return a `Promise` and SHALL use `os.fs.rmAsync` or `os.fs.unlinkAsync`

### Requirement: Hot-path services are asynchronous

Services that perform filesystem I/O on behalf of request handlers SHALL use asynchronous `OS` methods and SHALL expose asynchronous public APIs.

#### Scenario: File sync service runs without blocking

- **WHEN** `FileSyncService` performs a sync operation
- **THEN** it SHALL use `os.fs.existsAsync`, `os.fs.readdirAsync`, `os.fs.lstatAsync`, and `os.fs.readFileAsync`

#### Scenario: Impact duplication detection runs without blocking

- **WHEN** `JscpdService` builds an ignore file or reads a report
- **THEN** it SHALL use `os.fs.existsAsync`, `os.fs.readFileAsync`, and `os.fs.writeFileAsync`

### Requirement: Request handlers await asynchronous dependencies

HTTP and WebSocket handlers that call asynchronous repositories or services SHALL `await` the result before responding.

#### Scenario: REST handler awaits repository

- **WHEN** a REST endpoint calls `ProjectRepository.findById()`
- **THEN** it SHALL `await` the call and return the response after the Promise resolves

#### Scenario: WebSocket handler awaits service

- **WHEN** a WebSocket handler calls `ChatService.updateAgentActivity()`
- **THEN** it SHALL `await` the call if the service method is async
