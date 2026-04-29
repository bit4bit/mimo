## 1. Tests (BDD — write before implementation)

- [x] 1.1 Write failing test: `buildAcpCallbacks` emits `thought_start` with correct `sessionId` and `chatThreadId`
- [x] 1.2 Write failing test: `buildAcpCallbacks` emits `message_chunk` with correct `sessionId`, `chatThreadId`, and `content`
- [x] 1.3 Write failing test: `buildAcpCallbacks` truncates `toolInput` to 200 chars with `"..."` suffix
- [x] 1.4 Write failing test: `recordActivity` is called on `thought_chunk` via `spawnAcpProcess` path
- [x] 1.5 Write failing test: `recordActivity` is called on `message_chunk` via `respawnAcpProcess` path
- [x] 1.6 Write failing test: `recordActivity` is called on `tool_call` via `spawnAcpProcess` path
- [x] 1.7 Confirm all new tests fail before implementation

## 2. Implementation

- [x] 2.1 Add `private buildAcpCallbacks(sessionId: string, chatThreadId: string): AcpClientCallbacks` method to `MimoAgent` in `packages/mimo-agent/src/index.ts`
- [x] 2.2 Move all callback logic from `respawnAcpProcess` into `buildAcpCallbacks` (respawn version already has `recordActivity` calls — use it as the source of truth)
- [x] 2.3 Add `lifecycleManager.recordActivity` calls to `onThoughtStart`, `onThoughtChunk`, `onMessageChunk`, `onToolCall`, `onToolCallUpdate` inside `buildAcpCallbacks`
- [x] 2.4 Replace inline callback literal in `respawnAcpProcess` with `this.buildAcpCallbacks(sessionId, chatThreadId)`
- [x] 2.5 Replace inline callback literal in `spawnAcpProcess` with `this.buildAcpCallbacks(session.sessionId, chatThreadId)`
- [x] 2.6 Delete the now-removed duplicated callback code in both methods

## 3. Verification

- [x] 3.1 Run `cd packages/mimo-agent && bun test` — all tests pass (97 pass, 2 fail unrelated to change - same as before)
- [x] 3.2 Run `cd packages/mimo-platform && bun test` — no regressions
- [x] 3.3 Verify `packages/mimo-agent/src/index.ts` line count reduced by ~200 lines (2584 → 2490 = 94 lines saved, ~180 lines of duplicated code removed)
