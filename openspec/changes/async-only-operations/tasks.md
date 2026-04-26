## 1. Update OS Abstraction Interfaces

- [x] 1.1 Convert `FileSystem` interface in `src/os/types.ts` — all methods return `Promise<T>`
- [x] 1.2 Remove `runSync()` from `CommandRunner` interface in `src/os/types.ts`
- [x] 1.3 Verify TypeScript compilation passes after interface changes

## 2. Update Node.js Adapter

- [x] 2.1 Rewrite `NodeFileSystem` in `src/os/node-adapter.ts` using `fs/promises` APIs
- [x] 2.2 Remove `runSync()` method from `NodeCommandRunner`
- [x] 2.3 Remove unused `*Sync` imports from `node-adapter.ts`
- [x] 2.4 Verify Node.js adapter compiles and passes existing tests

## 3. Update Mock Adapter

- [x] 3.1 Rewrite `MockFileSystem` in `src/os/mock-adapter.ts` to return Promises
- [x] 3.2 Remove `runSync()` method from `MockCommandRunner`
- [x] 3.3 Update `runSync` error throw message in `MockCommandRunner` (remove it)
- [x] 3.4 Verify mock adapter compiles

## 4. Update Production Code — Call Sites

- [x] 4.1 Update `src/index.ts` — add `await` to all `this.os.fs.*` calls (18 call sites)
- [x] 4.2 Update `src/session.ts` — add `await` to all `this.os.fs.*` calls (9 call sites)
- [x] 4.3 Handle async operations in `session.ts` chokidar watch callback using async IIFE
- [x] 4.4 Update `src/acp/client.ts` — convert getters to async methods (`getAcpSessionId`, `getModelState`, `getModeState`, `getAvailableCommands`)
- [x] 4.5 Update all call sites of AcpClient getters in `src/index.ts` to use `await`
- [x] 4.6 Verify `src/index.ts` and `src/session.ts` compile with new async signatures

## 5. Update Test Suites

- [x] 5.1 Rewrite `src/os/os.test.ts` — convert all sync fs tests to async/await (~75 assertions)
- [x] 5.2 Remove `runSync` test cases from `src/os/os.test.ts`
- [x] 5.3 Rewrite `test/agent-fs-behaviors.test.ts` — convert sync calls to async/await
- [x] 5.4 Run full test suite and fix any failures

## 6. Verification

- [x] 6.1 Run TypeScript compilation across entire mimo-agent package
- [x] 6.2 Run `bun test` for unit tests
- [x] 6.3 Run `bun run test.full` for full suite (unit + integration)
- [x] 6.4 Verify no `runSync` references remain in codebase
- [x] 6.5 Verify no `*Sync` fs calls remain in production code (excluding `Bun.which()`)