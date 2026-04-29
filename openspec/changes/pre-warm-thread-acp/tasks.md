## 1. Tests (BDD — write before implementation)

- [x] 1.1 Write failing test: `request_state` for a cold thread starts ACP spawn without blocking
- [x] 1.2 Write failing test: thread enters `"initializing"` state after `request_state` triggers spawn
- [x] 1.3 Write failing test: second `request_state` for same cold thread does not start a duplicate spawn
- [x] 1.4 Write failing test: `user_message` arriving while `"initializing"` queues the prompt
- [x] 1.5 Write failing test: queued prompt is sent after ACP initialization completes
- [x] 1.6 Write failing test: thread transitions from `"initializing"` to `"active"` on successful ACP init
- [ ] 1.7 Confirm all new tests fail

## 2. Lifecycle state machine update

- [x] 2.1 Add `"initializing"` to `AcpSessionState` type in `packages/mimo-agent/src/lifecycle.ts`
- [x] 2.2 Add `setThreadState(sessionId, chatThreadId, state: AcpSessionState)` method to `SessionLifecycleManager` (or extend `initializeThread` to accept an initial state)
- [x] 2.3 Update `getThreadState` to return `"initializing"` for threads in that state

## 3. handleRequestState pre-warm

- [x] 3.1 In `handleRequestState` (`packages/mimo-agent/src/index.ts`): after storing thread config, check if `acpClients.get(key)` is undefined AND thread state is not already `"initializing"`
- [x] 3.2 If cold and not already initializing: call `this.lifecycleManager.setThreadState(sessionId, chatThreadId, "initializing")` then fire-and-forget `this.ensureThreadRuntime(sessionId, chatThreadId)`
- [x] 3.3 Do not await the spawn — proceed immediately to send `request_state` reply if client is ready, or skip if still initializing (client will send `session_initialized` on completion)

## 4. handleUserMessage initializing state

- [x] 4.1 In `handleUserMessage`: add `"initializing"` branch after `"waking"` branch
- [x] 4.2 Queue prompt via `lifecycleManager.queueThreadPrompt` and await ACP client, then send prompt (same pattern as `"waking"`)

## 5. ensureThreadRuntime state transition

- [x] 5.1 In `ensureThreadRuntime`: set thread state to `"active"` after `respawnAcpProcess` completes successfully
- [x] 5.2 On failure in `ensureThreadRuntime`: clear `"initializing"` state (remove or reset to allow retry)

## 6. Verification

- [ ] 6.1 Run `cd packages/mimo-agent && bun test` — all tests pass
- [ ] 6.2 Run `cd packages/mimo-platform && bun test` — no regressions
- [x] 6.3 Confirm `AcpSessionState` in `lifecycle.ts` includes `"initializing"`
