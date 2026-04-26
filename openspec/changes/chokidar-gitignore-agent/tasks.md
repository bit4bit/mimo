## 1. Dependency

- [x] 1.1 Add `"ignore": "^7.0.5"` to `packages/mimo-agent/package.json` dependencies and run `bun install`

## 2. Interface

- [x] 2.1 Extend `FileSystem.watch()` options in `packages/mimo-agent/src/os/types.ts` to accept `ignored?: (path: string) => boolean`
- [x] 2.2 Update `packages/mimo-agent/src/os/mock-adapter.ts` `watch()` signature to match (no-op behaviour unchanged)

## 3. Adapter

- [x] 3.1 Update `NodeFileSystem.watch()` in `packages/mimo-agent/src/os/node-adapter.ts` to forward `options.ignored` to chokidar's `ignored` option

## 4. Tests (failing first)

- [x] 4.1 Write a failing integration test in `packages/mimo-agent` that verifies: when `watch()` is called with an `ignored` predicate, the listener is NOT invoked for paths where the predicate returns true
- [x] 4.2 Write a failing integration test that verifies: watcher in a checkout with a `.gitignore` containing `dist/` does not emit events for files inside `dist/`
- [x] 4.3 Write a failing integration test that verifies: watcher in a checkout with a `.mimoignore` does not emit events for matching paths
- [x] 4.4 Write a failing integration test that verifies: watcher suppresses events for `node_modules`, VCS internals, `*.tmp`, `*~` even when no ignore files exist

## 5. Session watcher

- [x] 5.1 In `packages/mimo-agent/src/session.ts` `startFileWatcher()`: import `ignore` from `'ignore'` and `relative` from `'path'`
- [x] 5.2 Build the `ignored` predicate: VCS_INTERNALS fast-path + `ig.add(['node_modules','__pycache__','*.tmp','*~'])` + read `.gitignore` and `.mimoignore` from `checkoutPath` (skip if missing)
- [x] 5.3 Pass `{ recursive: true, ignored }` to `this.os.fs.watch()`
- [x] 5.4 Remove the hardcoded VCS_INTERNALS / node_modules / `__pycache__` / `.tmp` / `~` filter block from the callback

## 6. Verify

- [x] 6.1 All new tests pass: `cd packages/mimo-agent && bun test`
- [ ] 6.2 Full suite passes: `cd packages/mimo-agent && bun run test.full`
