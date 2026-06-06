## Why

When users change the idle timeout in session settings (e.g. setting it to `0` to disable parking, or increasing it to 30 minutes), the value is correctly persisted to `session.yaml`. However, the agent frequently reverts to the **10-minute default** (600000ms) later, causing unexpected session parking. This happens because the `session_ready` message sent when a new chat thread is created omits the `idleTimeoutMs` field, causing the agent to silently overwrite any previously set timeout with the hardcoded default.

## What Changes

- Add `idleTimeoutMs` (and other missing optional fields) to the `session_ready` payload in the chat-thread creation route (`web/features/sessions/pages/sessions.tsx`), making it consistent with the payload sent in `domain/agents/message-router.ts`.
- Add a defensive guard in the agent (`packages/mimo-agent/src/index.ts`) to skip overwriting an existing idle-timeout cache entry when a `session_ready` message omits the field.

## Capabilities

### New Capabilities
*None — this is a behavioral fix to existing mechanisms.*

### Modified Capabilities
- `session-idle-config`: Fixed requirement: platform MUST always include the current `idleTimeoutMs` in any `session_ready` payload sent to an already-bootstrapped agent.
- `chat-thread-management`: Fixed requirement: when a new thread is created for an assigned agent, the `session_ready` notification must carry the session's current configuration (including `idleTimeoutMs`) so the agent does not revert to defaults.

## Impact

- **Frontend:** `web/features/sessions/pages/sessions.tsx` (`POST /:id/chat-threads`) — update `session_ready` payload.
- **Agent:** `mimo-agent/src/index.ts` (`handleSessionReady`) — guard against accidental default overwrite.
- **Tests:** Add integration tests to assert that thread creation does not clobber an existing non-default idle timeout.
