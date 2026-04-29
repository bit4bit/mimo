## Why

`spawnAcpProcess` and `respawnAcpProcess` in `packages/mimo-agent/src/index.ts` each contain ~200 lines of near-identical `AcpClientCallbacks` literals, violating DRY and making both methods hard to maintain. Additionally, `spawnAcpProcess` omits `lifecycleManager.recordActivity()` calls present in `respawnAcpProcess`, meaning initial ACP spawns do not reset the idle timer — threads can be parked before their first response finishes.

## What Changes

- Extract `private buildAcpCallbacks(sessionId, chatThreadId): AcpClientCallbacks` factory method on `MimoAgent`
- Include `lifecycleManager.recordActivity()` on `onThoughtStart`, `onThoughtChunk`, `onMessageChunk`, `onToolCall`, `onToolCallUpdate` in all paths
- Replace duplicated callback literals in `spawnAcpProcess` and `respawnAcpProcess` with calls to this factory
- Delete ~200 lines of duplicated code

## Capabilities

### New Capabilities

- `acp-callback-factory`: A single factory method that constructs ACP event callbacks for any thread, ensuring consistent idle-timer resets and WS message emission across all spawn paths.

### Modified Capabilities

<!-- No spec-level behavior changes — this is a pure refactor of internal implementation -->

## Impact

- `packages/mimo-agent/src/index.ts`: `MimoAgent.spawnAcpProcess`, `MimoAgent.respawnAcpProcess`, new `MimoAgent.buildAcpCallbacks`
- `packages/mimo-agent/test/`: new integration tests for callback factory behavior
