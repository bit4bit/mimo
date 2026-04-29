## Why

When a user sends their first message to a thread that has no active ACP client, `handleUserMessage` calls `ensureThreadRuntime()` inline — awaiting a cold ACP process spawn, JSON handshake, `loadSession`, and model/mode restoration before the prompt can be sent. This adds 2–5 seconds of invisible latency: the user sees no feedback until `thought_start` finally arrives. The browser always sends `request_state` before the user can type (on thread switch and on page load), making it a reliable pre-warming trigger. Eagerly starting ACP on `request_state` and queuing prompts that arrive while the spawn is in progress eliminates this cold-start from the user-visible message path.

## What Changes

- Add `"initializing"` as a new thread lifecycle state in `SessionLifecycleManager`
- `handleRequestState` in `MimoAgent`: when no ACP client exists for the thread, start `ensureThreadRuntime` as a fire-and-forget (non-blocking), set thread state to `"initializing"`
- `handleUserMessage`: if thread state is `"initializing"`, queue the prompt (same pattern already used for `"waking"`) and send it once the client becomes active
- `request_state` reply is sent immediately — it does not wait for ACP to be ready

## Capabilities

### New Capabilities

- `thread-pre-warm`: Eager ACP process startup triggered by `request_state`, decoupling ACP initialization latency from the first user message send.

### Modified Capabilities

- `acp-session-parking`: The thread lifecycle state machine gains an `"initializing"` state alongside the existing `"active"`, `"parked"`, and `"waking"` states.

## Impact

- `packages/mimo-agent/src/lifecycle.ts` — add `"initializing"` state to `AcpSessionState`
- `packages/mimo-agent/src/index.ts` — `handleRequestState` triggers fire-and-forget spawn; `handleUserMessage` handles `"initializing"` state
- `packages/mimo-agent/test/` — new tests for pre-warm behavior and prompt queuing
