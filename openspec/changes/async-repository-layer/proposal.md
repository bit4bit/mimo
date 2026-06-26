## Why

After converting the commit-preview manifest store, SCC service, impact dependency parsing, and file application to asynchronous I/O, the `mimo-platform` package still contains a large number of synchronous `os.fs.*` calls in the domain repository layer and related services. Every repository (`SessionRepository`, `ProjectRepository`, `AgentRepository`, `McpServerRepository`, `CredentialRepository`, `ImpactRepository`, `UserRepository`) and several services (`FileSyncService`, `FrameStateService`, `ChatService`, `ExpertService`, `JscpdService`, `ConfigService`, `ProjectVcsCache`) call the synchronous versions of `exists`, `readFile`, `writeFile`, `mkdir`, `readdir`, `unlink`, etc. On a busy server these calls block the event loop, causing HTTP/WebSocket latency spikes and unresponsive UI whenever a large project is loaded, listed, or mutated. The next step is to make the repository and hot-path service layer fully async so the platform remains responsive under load.

## What Changes

- Convert all repository CRUD methods from synchronous `os.fs.*` calls to the async counterparts already added to the `OS` abstraction.
- Convert hot-path services that still do synchronous disk I/O (`FileSyncService`, `JscpdService`, `FrameStateService`, `ChatService`, `ExpertService`, `ConfigService`) to async I/O.
- Update `mimo-context.ts` to await any async service initialization that now requires it.
- Update API/WebSocket route handlers that currently call repositories synchronously or without awaiting to `await` the new async methods.
- Keep legacy synchronous methods as thin wrappers only where external callers/tests still need them, and mark them deprecated.
- Add or update behavior/integration tests that prove a request with many repository operations does not block concurrent requests.
- **BREAKING**: Internal callers of repository/service methods must `await` the new async signatures. Public REST/WebSocket behavior remains unchanged.

## Capabilities

### New Capabilities
- `async-repository-layer`: The domain repositories and hot-path services use exclusively async file-system operations.
- `non-blocking-concurrent-requests`: The web server can interleave multiple HTTP/WebSocket requests even while one request performs repository I/O.

### Modified Capabilities
- `async-filesystem`: Extend the existing spec to require that all production code paths use async methods; sync methods are preserved only as legacy/test helpers.
- `projects`, `agent-management`, `session-agent-subpath`, `file-sync`, `impact-tracking`, `frame-buffers`, `chat-thread-management`: These capabilities rely on repositories that will become async. Their observable behavior does not change, so no delta spec is required unless a test reveals a behavioral contract change.

## Impact

- Affected code: `packages/mimo-platform/src/domain/*/{repository.ts,service.ts}`, `packages/mimo-platform/src/infrastructure/context/mimo-context.ts`, `packages/mimo-platform/src/api/**/*`.
- Tests: Repository tests, integration tests, and any test that manually calls repository methods will need to be updated to `await`.
- Dependencies: No new npm/bun dependencies; only existing `fs/promises` OS methods.
- Systems: Platform HTTP/WebSocket responsiveness; no agent changes required.
