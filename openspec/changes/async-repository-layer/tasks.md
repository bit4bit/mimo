## 1. Repository async migration

- [x] 1.1 Convert `CredentialRepository` to async I/O (`create`, `findById`, `findByOwner`, `update`, `delete`, `exists`).
- [x] 1.2 Convert `UserRepository` to async I/O (`create`, `findByUsername`, `findAll`, `verifyPassword`, `exists`).
- [x] 1.3 Convert `AgentRepository` to async I/O (`create`, `findById`, `findByOwner`, `listByStatus`, `update`, `delete`, `exists`, `deleteAll`).
- [x] 1.4 Convert `McpServerRepository` to async I/O (`create`, `findById`, `findByOwner`, `findAll`, `update`, `delete`, `exists`).
- [x] 1.5 Convert `ProjectRepository` to async I/O (`create`, `findById`, `findByOwner`, `findAll`, `update`, `delete`, `deleteByOwner`, `exists`).
- [ ] 1.6 Convert `SessionRepository` to async I/O (`create`, `findById`, `findByProjectAndId`, `listByProject`, `listAll`, `findByAssignedAgentId`, `update`, `delete`, `deleteByProject`, `exists`).
  - **Not completed:** initial async conversion introduced test flakiness and type mismatch regressions. Reverted to keep the change safe and avoid blocking the rest of the migration.
- [x] 1.7 Convert `ImpactRepository` to async I/O (`save`, `findBySession`, `findByProject`, `delete`, `deleteByProject`).

## 2. Service async migration

- [x] 2.1 Convert `ConfigService` to async I/O (`load`, `save`, `get`, `set`).
- [x] 2.2 Convert `JscpdService` to async I/O (`isInstalledAsync` usage, ignore-file build, report parse).
- [x] 2.3 Convert `FileSyncService` to async I/O (`sync`, `getSyncState`, `deleteSessionSyncState`).
- [x] 2.4 Convert `FrameStateService` to async I/O (`load`, `save`).
- [x] 2.5 Convert `ChatService` to async I/O (`updateAgentActivity` and any disk-touching helpers).
- [x] 2.6 Convert `ExpertService` to async I/O if it performs disk reads/writes.

## 3. Handler and wiring updates

- [x] 3.1 Update `mimo-context.ts` to await any service that now requires async initialization.
- [x] 3.2 Update REST handlers under `src/api/rest/**` to `await` repository/service calls.
- [x] 3.3 Update WebSocket handlers under `src/api/websocket/**` to `await` repository/service calls.
- [x] 3.4 Update `AutoCommitService`, `FileSyncService`, `CommitService`, and other service consumers to `await` the now-async repositories.

## 4. Tests and verification

- [x] 4.1 Update repository unit tests to `await` async methods.
- [x] 4.2 Update service tests to `await` async methods.
- [x] 4.3 Update integration tests to `await` async handlers.
- [x] 4.4 Add a concurrency test that proves two simultaneous requests with heavy repository I/O do not block each other.
- [x] 4.5 Run `bun test` in `packages/mimo-platform` until all new regressions are resolved.
  - **Result:** 1149 pass, 5 fail. The remaining failures match the pre-existing baseline on `main`.
- [x] 4.6 Run `bun run test.full` for full integration coverage.
  - **Result:** 1153 pass, 5 fail. Same pre-existing failures as unit tests, plus the same pre-existing `shared-fossil-server.js` module-not-found unhandled error seen on `main`.

## 5. Cleanup

- [x] 5.1 Audit remaining synchronous `os.fs.*` calls in `src/domain` and `src/api`; convert or document why they must remain sync.
  - Targeted services converted as scoped. Legacy sync helpers in `changed-files.ts`, `SccService`, `ProjectVcsCache`, and `FileService` were intentionally left unchanged because they were outside this change's scope; the most impactful paths now use async methods.
- [x] 5.2 Remove temporary sync wrappers from repositories if no tests use them.
- [x] 5.3 Verify `mimo-agent` tests still pass (no changes expected).
  - **Result:** 168 pass, 0 fail.
