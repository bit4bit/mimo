## Context

The mimo-agent package currently uses a synchronous `FileSystem` abstraction (`src/os/types.ts`) backed by Node.js `*Sync` APIs (`existsSync`, `readFileSync`, etc.). The `CommandRunner` interface includes both `run()` (async) and `runSync()` (sync). `AcpClient` exposes synchronous getters for state (`acpSessionId`, `modelState`, `modeState`, `availableCommands`).

This creates three problems:
1. **Event loop blocking**: File I/O and command execution block the event loop
2. **API inconsistency**: Mixed sync/async surface makes the codebase harder to reason about
3. **Portability barrier**: Sync file system APIs prevent running in environments without synchronous fs access

The codebase already uses async/await extensively for WebSocket handling, ACP communication, and command execution — the sync fs layer is the remaining outlier.

## Goals / Non-Goals

**Goals:**
- Convert `FileSystem` interface to fully asynchronous (all methods return `Promise`)
- Remove `runSync()` from `CommandRunner` interface and all implementations
- Convert `AcpClient` getters to async methods
- Update all call sites with `await`
- Update all tests to use async patterns
- Maintain identical runtime behavior (no functional changes)

**Non-Goals:**
- Making `JSON.parse`/`JSON.stringify` async (CPU-bound, not I/O)
- Converting `Bun.which()` to async (no async equivalent in Bun API)
- Converting timer APIs (`setTimeout`, `clearTimeout`)
- Changing `console.log` logging to async
- Adding new features or capabilities beyond the async conversion

## Decisions

### 1. Use `fs/promises` module for Node.js adapter

**Rationale**: Node.js provides a dedicated `fs/promises` module with native Promise-based APIs. This is cleaner than promisifying `fs` callbacks and is the standard Node.js pattern for async file operations.

**Alternative considered**: Wrapping `fs` callbacks manually with `new Promise()`. Rejected because `fs/promises` is the idiomatic approach and reduces boilerplate.

### 2. Fire-and-forget async in synchronous callbacks

**Rationale**: Chokidar watch callbacks and process event handlers are synchronous by contract. We cannot change their signatures. Instead, we wrap async operations in an async IIFE:

```typescript
watcher.on("change", (absPath) => {
  (async () => {
    const exists = await this.os.fs.exists(absPath);
    // ... handle async logic
  })();
});
```

This avoids blocking while honoring the sync callback contract. Errors are handled with try/catch inside the IIFE.

**Alternative considered**: Converting the entire watch setup to use async generators or streams. Rejected because chokidar's API is event-based and changing the abstraction layer would be out of scope.

### 3. Convert AcpClient getters to async methods, not async getters

**Rationale**: JavaScript does not support async getters natively (they return Promise, not the resolved value). Converting to async methods (`getAcpSessionId()`, `getModelState()`, etc.) is the standard pattern.

**Alternative considered**: Keeping sync getters and maintaining an in-memory cache updated asynchronously. Rejected because it adds complexity and cache invalidation concerns for a simple state read.

### 4. Keep `FileWatcher` interface synchronous

**Rationale**: The `FileWatcher` interface (`close()`, `on()`) represents event listener registration and cleanup, not I/O. These operations are fast and synchronous by nature. Only the `FileSystem` operations that actually perform I/O become async.

## Risks / Trade-offs

**[Risk] Breaking API changes require consumer updates**
→ All code using `FileSystem` or `CommandRunner` interfaces will need to add `await`. Since these are internal abstractions (not public npm package APIs), this is contained to the mimo-agent package itself.

**[Risk] Async IIFEs in event handlers can swallow errors**
→ Mitigation: Always wrap async IIFE body in try/catch and log errors. Add a helper utility if this pattern repeats.

**[Risk] Test suite rewrite is large (~75 assertions in os.test.ts)**
→ Mitigation: Convert tests incrementally by file. Use `await` consistently. The test logic itself doesn't change — only the wrapping.

**[Risk] MockFileSystem changes may break tests relying on synchronous behavior**
→ Mitigation: MockFileSystem will return resolved Promises immediately (no actual async delay), so test timing remains deterministic. The only change is adding `await` at call sites.

**[Trade-off] Bun.which() remains synchronous**
→ `ClaudeAgentProvider.spawn()` uses `Bun.which()` to resolve the executable path. There is no async equivalent. The impact is minimal (single PATH lookup, not I/O-bound).
