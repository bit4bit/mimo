## 1. Add missing fields to thread-creation `session_ready`

- [x] 1.1 Add `idleTimeoutMs`, `modelState`, `modeState` to the `session_ready` payload in `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx` (`POST /:id/chat-threads` route)

## 2. Add defensive guard on agent side

- [x] 2.1 Update `handleSessionReady` in `packages/mimo-agent/src/index.ts` to only overwrite `sessionIdleTimeouts` when `idleTimeoutMs` is explicitly present (i.e. `typeof idleTimeoutMs === "number"`)

## 3. Integration Tests

- [x] 3.1 Add a failing integration test in `packages/mimo-platform/test/sessions.test.ts` that creates a session, sets a custom idle timeout, creates a new chat thread, and asserts the agent receives the correct `idleTimeoutMs` in the `session_ready` message

## 4. Verify & Archive

- [x] 4.1 Run the full test suite: `cd packages/mimo-platform && bun run test.full`
- [x] 4.2 Run agent tests: `cd packages/mimo-agent && bun run test.full`
- [x] 4.3 Confirm the `session_ready` payload shape matches between `message-router.ts` and `sessions.tsx`
