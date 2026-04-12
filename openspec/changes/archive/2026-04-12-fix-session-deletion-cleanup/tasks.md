## 1. Add session_ended handler to mimo-agent

- [x] 1.1 Add `case "session_ended":` to handleMessage() switch statement in mimo-agent/src/index.ts
- [x] 1.2 Implement `handleSessionEnded(message)` method to:
  - Extract sessionId from message
  - Log session end
  - Remove from acpClients Map
  - Call sessionManager.terminateSession(sessionId)
- [x] 1.3 Ensure handler is idempotent (safe if session doesn't exist)

## 2. Testing

- [x] 2.1 Add test for session_ended message handling
- [x] 2.2 Add test for idempotent cleanup (duplicate messages)
- [x] 2.3 Add test for unknown session ID
- [x] 2.4 Verify ACP process is terminated after session_ended

## 3. Verification

- [x] 3.1 Run mimo-agent tests
- [x] 3.2 Manual test: Create session → Delete session → Verify no orphaned opencode processes
- [x] 3.3 Verify existing tests still pass
