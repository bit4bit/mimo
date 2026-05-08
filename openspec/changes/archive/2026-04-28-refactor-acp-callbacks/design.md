## Context

`MimoAgent` in `packages/mimo-agent/src/index.ts` has two methods that spawn ACP processes: `spawnAcpProcess` (called from `handleAcpRequest` on platform-initiated restart) and `respawnAcpProcess` (called from `ensureThreadRuntime` and `lifecycleManager.onSpawnAcp` for on-demand and parked-session wake). Both methods manually construct an identical `AcpClientCallbacks` object inline — ~200 lines each. The only behavioral difference is that `respawnAcpProcess` calls `this.lifecycleManager.recordActivity(sid, chatThreadId)` inside `onThoughtStart`, `onThoughtChunk`, `onMessageChunk`, `onToolCall`, and `onToolCallUpdate`, while `spawnAcpProcess` omits these calls. This omission means threads started via `spawnAcpProcess` never reset the idle timer during their first response and can be prematurely parked.

## Goals / Non-Goals

**Goals:**

- Single source of truth for ACP callback construction
- Idle-timer resets (`recordActivity`) applied consistently in both spawn paths
- Reduce `index.ts` by ~200 lines
- All existing behavior preserved; tests pass

**Non-Goals:**

- Changing the ACP protocol or callback signatures
- Merging `spawnAcpProcess` and `respawnAcpProcess` into one method (they have different initialization logic)
- Modifying lifecycle state machine behavior

## Decisions

### Extract `buildAcpCallbacks` as a private method

`buildAcpCallbacks(sessionId: string, chatThreadId: string): AcpClientCallbacks` is added to `MimoAgent`. It closes over `this` (for `this.send`, `this.lifecycleManager`, `this.pendingPermissions`). Both `spawnAcpProcess` and `respawnAcpProcess` replace their inline callback literals with a call to this method.

**Alternative considered**: A standalone factory function outside the class. Rejected — it would need `send`, `lifecycleManager`, and `pendingPermissions` passed as arguments, making the call site verbose and the function signature fragile as new dependencies are added.

### Always call `recordActivity` in callbacks

`onThoughtStart`, `onThoughtChunk`, `onMessageChunk`, `onToolCall`, `onToolCallUpdate` all call `this.lifecycleManager.recordActivity(sessionId, chatThreadId)`. This makes initial spawns behave identically to respawns with respect to idle timeout, fixing the latent bug.

**Alternative considered**: Keep `spawnAcpProcess` without `recordActivity`. Rejected — there is no use case where a thread actively receiving its first response should be eligible for parking.

### Callback parameter uses the outer `sessionId`/`chatThreadId`, not the inner `sid`/`sid`-style argument

The callbacks receive `sessionId` as a parameter (named `sid` in the callback body). The `send` call uses `sid` to keep the value passed from the ACP layer. `lifecycleManager.recordActivity` uses `sid` and `chatThreadId` from the outer closure. This is consistent with the existing `respawnAcpProcess` implementation.

## Risks / Trade-offs

- **`recordActivity` on initial spawn may change parking timing** → Only affects threads that were previously never resetting the timer during their first response. The change makes them consistent with respawned threads. No regression expected.
- **Closure captures `this`** → Standard TypeScript pattern; no risk as long as `buildAcpCallbacks` is only called after `MimoAgent` construction.

## Migration Plan

No data migration. No API change. Pure refactor within `packages/mimo-agent/src/index.ts`. Existing tests continue to pass; new tests cover the unified behavior.
