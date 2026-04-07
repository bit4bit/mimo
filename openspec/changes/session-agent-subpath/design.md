## Context

The agent's ACP process is initialized with a `cwd` equal to `checkoutPath` (the repo root). This is hardcoded in `MimoAgent.spawnAcpProcess()`:

```typescript
acpClient.initialize(sessionInfo.checkoutPath, ...)
```

`checkoutPath` is `join(agentWorkDir, sessionId)` — always the root of the Fossil checkout. For monorepos, users want the agent to start in a specific package directory so the agent's context is scoped appropriately.

The `agentSubpath` field needs to flow from session creation through to the agent's ACP initialization. The path is stored on the session, sent in the `session_ready` WebSocket message, and applied at ACP spawn time.

## Goals / Non-Goals

**Goals:**
- Let users set an optional subdirectory as the agent's starting working directory at session creation time
- Flow the subpath from `session.yaml` → `session_ready` → ACP `cwd`

**Non-Goals:**
- Validating or sanitizing the subpath (trusted input from the session owner)
- Restricting the agent to the subpath (it's a starting directory, not a jail)
- Changing the file watcher scope (stays on the full checkout root)
- Changing the local dev mirror behavior (unrelated)
- Allowing subpath changes after session creation

## Decisions

### D1: Store `agentSubpath` as a raw string in `session.yaml`

**Decision:** Store exactly what the user typed (e.g., `packages/backend`). No normalization, no leading-slash stripping, no trailing-slash handling — Node's `path.join()` handles those edge cases cleanly when combining with `checkoutPath`.

**Alternatives considered:**
- Normalize on write (strip slashes, resolve `.` etc.) — adds complexity with no real benefit since `path.join` already handles it.

### D2: Apply subpath only at ACP initialization, not at checkout setup

**Decision:** `checkoutPath` remains the Fossil checkout root throughout. Only the value passed to `acpClient.initialize()` changes:

```typescript
const acpCwd = session.agentSubpath
  ? join(checkoutPath, session.agentSubpath)
  : checkoutPath;
acpClient.initialize(acpCwd, ...)
```

The file watcher, Fossil sync, and mirror sync all continue using `checkoutPath`. Only the AI agent's starting directory is affected.

### D3: `agentSubpath` is set at creation only, not editable

**Decision:** No update endpoint for `agentSubpath`. Sessions are cheap to recreate; editing a running session's cwd mid-flight would be confusing.

## Risks / Trade-offs

- **Subpath doesn't exist in checkout** → ACP process may fail to start or behave unexpectedly. Since we trust the user and it's an optional field, this is acceptable — same as any misconfigured path.
- **Fossil checkout not yet populated when ACP starts** → Already a potential race condition with or without subpath; this change doesn't make it worse.

## Migration Plan

No migration needed. `agentSubpath` is an optional field that defaults to `undefined`. Existing sessions without it behave identically to today.
