## Context

The `mimo-platform` package uses a filesystem-backed persistence layer accessed through an injected `OS` abstraction. In the first pass (#61 / recent async work) we made the commit preview, SCC cache, impact dependency parsing, and file application asynchronous. However, the repository layer that backs HTTP/WebSocket endpoints still performs synchronous `os.fs.*` calls for almost every CRUD operation. Because Bun/Node runs JavaScript on a single event loop, every `readFileSync`, `writeFileSync`, `mkdirSync`, `readdirSync`, etc. blocks all concurrent requests for the duration of the disk operation. On macOS with a large `~/.mimo` tree or under high concurrency this produces visible UI latency.

The `OS` interface already has async counterparts for every sync method we need (`existsAsync`, `readFileAsync`, `writeFileAsync`, `mkdirAsync`, `readdirAsync`, `unlinkAsync`, `rmAsync`, `copyFileAsync`, `cpAsync`, `renameAsync`, `chmodAsync`, `statAsync`, `lstatAsync`). The remaining work is to migrate the repository and hot-path service methods to use them and to propagate `async`/`await` through the call chain up to the HTTP/WebSocket handlers.

## Goals / Non-Goals

**Goals:**
- Convert all domain repositories and hot-path services to async filesystem I/O.
- Ensure no production request handler blocks the event loop on disk I/O.
- Keep tests passing with minimal behavioral changes.
- Preserve legacy sync method wrappers only where needed by existing tests, marked as deprecated.

**Non-Goals:**
- Do not change persistence formats, directory layouts, or public REST/WebSocket contracts.
- Do not rewrite repositories to use a database or other storage backend.
- Do not convert the `mimo-agent` package; it is already async-first.
- Do not remove synchronous `OS` methods entirely; they remain for tests and edge cases.

## Decisions

1. **Migrate top-down from API handlers inward.**
   - Rationale: The biggest user-visible win is making request handlers non-blocking. Once handlers `await` repositories, the repository methods must be async. This avoids dead-ends where a method is async but its caller is still sync.

2. **Keep method names identical, only change return type to `Promise<T>`.**
   - Rationale: Minimizes diff noise and makes review easier. Callers add `await`; method bodies replace `os.fs.readFile` with `await os.fs.readFileAsync`, etc.

3. **Convert `listAll()` / `listByProject()` / `findBy*` to async and read directory entries concurrently with `Promise.all`.**
   - Rationale: Listing many sessions/projects currently reads files sequentially. `Promise.all` lets the OS schedule reads concurrently and returns control to the event loop between reads.

4. **Leave sync wrappers only in `OS` itself and mark repository wrappers deprecated.**
   - Rationale: Some existing unit tests instantiate repositories directly with mock OS and call methods without `await`. Converting those tests is part of the work, but a few sync aliases reduce churn during the transition. They will be removed in a follow-up.

5. **Do not batch multiple writes into transactions.**
   - Rationale: The current persistence model is single-file YAML/JSON writes with no transactional semantics. Keeping the same model avoids scope creep and risk. Each write remains independent.

## Risks / Trade-offs

- **[Risk] Large diff across many files → increased chance of missed `await` or signature mismatch.**
  - **Mitigation**: Migrate one repository/service at a time, run the full test suite after each, and rely on TypeScript to catch unawaited Promises.
- **[Risk] Async methods that throw synchronously now reject Promises; callers may not handle rejection.**
  - **Mitigation**: Repository methods already wrap errors in most cases. Where they don't, add `try/catch` that returns `null`/`[]` as before but now via a resolved Promise.
- **[Risk] Concurrent reads/writes to the same file could produce races that sync code serialized implicitly.**
  - **Mitigation**: The repository layer generally writes one file per entity. Where multiple writes happen (e.g., `ProjectRepository.delete`), keep the same order and rely on atomic `rename`/`writeFileAsync` from `fs/promises`. No new race conditions are introduced by making existing operations async.
- **[Trade-off] Wall-clock time of individual requests may slightly increase due to async scheduling overhead, but overall server throughput and latency under concurrency will improve.**

## Migration Plan

1. Convert repositories in this order: `CredentialRepository`, `UserRepository`, `AgentRepository`, `McpServerRepository`, `ProjectRepository`, `SessionRepository`, `ImpactRepository`.
2. Convert services: `ConfigService`, `JscpdService`, `FileSyncService`, `FrameStateService`, `ChatService`, `ExpertService`.
3. Update `mimo-context.ts` if any service now requires async initialization.
4. Update API/WebSocket handlers to `await` repository/service calls.
5. Run `bun test` for `mimo-platform` after each repository/service migration.
6. After all tests pass, remove any temporary sync wrappers that are no longer used.

## Open Questions

- Should we introduce a small in-memory LRU cache for frequently read small files (e.g., session metadata) to reduce disk I/O, or is pure async I/O sufficient?
- Should the synchronous `OS` methods be removed entirely in a follow-up change once all callers are async?
