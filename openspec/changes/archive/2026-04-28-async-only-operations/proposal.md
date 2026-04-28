## Why

The mimo-agent package currently mixes synchronous and asynchronous operations. The `FileSystem` interface uses blocking `*Sync` APIs, and `CommandRunner` exposes a `runSync()` method. This blocks the event loop during I/O, prevents portability to environments without synchronous file system access (e.g., browsers, Web Workers), and creates an inconsistent API surface where some operations return Promises and others return values directly. Converting to async-only eliminates blocking I/O, improves concurrency, and establishes a uniform async contract across the entire package.

## What Changes

- **BREAKING**: Convert `FileSystem` interface from synchronous to asynchronous — all methods return `Promise<T>` instead of `T`
- **BREAKING**: Remove `runSync()` from `CommandRunner` interface and all implementations
- **BREAKING**: Convert `AcpClient` getters (`acpSessionId`, `modelState`, `modeState`, `availableCommands`) to async methods
- Update `NodeFileSystem` implementation to use `fs/promises` APIs instead of `*Sync` variants
- Update `MockFileSystem` implementation to return Promises
- Add `await` at all call sites in production code (`index.ts`, `session.ts`)
- Handle async operations inside synchronous callbacks (e.g., chokidar watch handlers) via fire-and-forget async IIFEs
- Update test suites (`os.test.ts`, `agent-fs-behaviors.test.ts`) to use async/await patterns
- Remove `runSync` tests from `os.test.ts`

## Capabilities

### New Capabilities
- `async-filesystem`: Asynchronous file system abstraction with Promise-based API

### Modified Capabilities
- (none — this is a pure implementation refactor with no behavioral changes to user-facing capabilities)

## Impact

- **Files modified**: `src/os/types.ts`, `src/os/node-adapter.ts`, `src/os/mock-adapter.ts`, `src/index.ts`, `src/session.ts`, `src/acp/client.ts`, `src/os/os.test.ts`, `test/agent-fs-behaviors.test.ts`
- **Breaking API changes**: `FileSystem` interface, `CommandRunner` interface, `AcpClient` getters
- **Runtime behavior**: No functional changes — same I/O operations, just non-blocking
- **Tests**: All sync fs tests rewritten with `async/await`; `runSync` tests removed
