## Context

`AcpSessionState` in `lifecycle.ts` currently has three values: `"active"`, `"parked"`, `"waking"`. The `"waking"` state is entered when a parked thread receives a new prompt — it respawns ACP and drains the queue. There is no state for "spawning for the first time" — first-time spawns happen lazily inside `handleUserMessage` via `ensureThreadRuntime()`, blocking the message path for 2–5 seconds.

The browser sends `request_state` whenever it switches to a thread or reconnects. This is a reliable signal that the user is about to interact with the thread, making it the ideal pre-warm trigger.

## Goals / Non-Goals

**Goals:**

- ACP spawn begins on `request_state` for a cold thread (no ACP client present)
- `request_state` reply is not blocked by the spawn
- Prompts arriving while spawn is in progress are queued and drained once active
- First `user_message` after a `request_state` finds ACP already running (or nearly so)

**Non-Goals:**

- Pre-warming on page load before `request_state` (no earlier signal exists)
- Cancelling a pre-warm if the user never sends a message
- Changing the parked → waking flow (already correct)

## Decisions

### Add `"initializing"` to `AcpSessionState`

```ts
export type AcpSessionState = "active" | "parked" | "waking" | "initializing";
```

`"initializing"` means: ACP process has been spawned but `initialize()` has not yet completed. Transitions:

- `(none)` → `"initializing"` on `handleRequestState` when no ACP client exists
- `"initializing"` → `"active"` when `spawnAcpProcess`/`respawnAcpProcess` completes
- `"initializing"` + incoming `user_message` → queue prompt, send once `"active"`

**Alternative considered**: Reuse `"waking"` for this case. Rejected — `"waking"` semantically means "recovering from parked state with cached acpSessionId". `"initializing"` is a fresh first spawn. Keeping them separate avoids applying cached-state recovery logic to a fresh thread.

### `handleRequestState` triggers fire-and-forget spawn

```ts
private async handleRequestState(message: any): Promise<void> {
  // ... existing thread config storage ...

  if (!this.acpClients.get(key)) {
    // Pre-warm: non-blocking
    this.lifecycleManager.setThreadState(sessionId, chatThreadId, "initializing");
    void this.ensureThreadRuntime(sessionId, chatThreadId);
  }

  // Send request_state reply immediately (don't await spawn)
  const acpClient = this.acpClients.get(key);
  if (acpClient) {
    // Already up (e.g. rapid request_state calls) — reply normally
    const modelState = await acpClient.getModelState();
    // ...send session_initialized...
  }
  // If still initializing, session_initialized will be sent by ensureThreadRuntime when ready
}
```

**Alternative considered**: Send a `session_initializing` message so the UI can show a spinner. Deferred — the current `session_initialized` message sent by `spawnAcpProcess` on completion serves the same purpose.

### `handleUserMessage` handles `"initializing"` state

```ts
if (threadState === "initializing") {
  // Queue and wait — same pattern as "waking"
  await this.lifecycleManager.queueThreadPrompt(
    sessionId,
    chatThreadId,
    content,
  );
  const acpClient = this.acpClients.get(key);
  if (acpClient) {
    await this.sendPrompt(acpClient, sessionId, chatThreadId, content);
  }
  return;
}
```

The `queueThreadPrompt` + `sendPrompt` pattern already exists for `"waking"`. Reusing it for `"initializing"` keeps the two paths symmetric.

### `ensureThreadRuntime` sets `"initializing"` before spawning

`ensureThreadRuntime` already calls `lifecycleManager.initializeThread(sessionId, chatThreadId, 600000)`. After this change it additionally sets state to `"initializing"` before the spawn and `"active"` after. The lifecycle manager's `initializeThread` is renamed/extended or a new `setThreadState` method is added.

## Risks / Trade-offs

- **Race: `request_state` fires, then user sends message before spawn completes** → Handled: `"initializing"` state causes the message to be queued. The queue drains when `"active"` is reached.
- **Race: two rapid `request_state` messages** → Second one finds `acpClients.get(key)` still null (spawn in progress) and would start a second spawn. Mitigation: check state is not already `"initializing"` before starting the fire-and-forget.
- **Pre-warm on a thread the user never uses** → ACP process starts unnecessarily. Cost: ~50ms spawn + idle timeout eventually parks it. Acceptable.

## Migration Plan

1. Add `"initializing"` to `AcpSessionState` in `lifecycle.ts`
2. Add `setThreadState(sessionId, chatThreadId, state)` to `SessionLifecycleManager` (or extend `initializeThread`)
3. Update `handleRequestState` in `index.ts` to trigger fire-and-forget spawn
4. Update `handleUserMessage` to handle `"initializing"` the same as `"waking"`
5. Guard against duplicate spawns (check state before starting fire-and-forget)
6. Tests confirm pre-warm behavior and prompt queuing
