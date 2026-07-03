## 1. Server: pong response

- [x] 1.1 Write a failing test: chat WebSocket handler replies with `{ type: "pong" }` when it receives `{ type: "ping" }`
- [x] 1.2 Add a `case "ping"` to the chat message handler in `src/api/websocket/handlers.ts` that sends `{ type: "pong", timestamp }`
- [x] 1.3 Verify unknown message types still fall through to the existing debug log (no regression)

## 2. Frontend: heartbeat timer

- [x] 2.1 Add `HEARTBEAT_INTERVAL_MS` and `MISSED_PONG_LIMIT` constants and `heartbeatInterval` / `lastPongAt` fields to `ChatState`
- [x] 2.2 In `connectWebSocket` `onopen`, clear any existing heartbeat interval and start a new one that sends `{ type: "ping" }` each interval
- [x] 2.3 Handle incoming `{ type: "pong" }` in `handleWebSocketMessage` by recording `lastPongAt`
- [x] 2.4 In `onclose`, clear the heartbeat interval

## 3. Frontend: zombie detection and reconnect

- [x] 3.1 On each heartbeat tick, if no pong has been received within `MISSED_PONG_LIMIT` intervals, force `ChatState.socket.close()` and clear the heartbeat interval
- [x] 3.2 Confirm the existing `onclose` reconnect path runs after a forced close
- [x] 3.3 Reset `lastPongAt` on `onopen` so a fresh connection is not immediately judged dead

## 4. Frontend: reconcile history on reconnect

- [x] 4.1 In `onopen`, alongside `request_state`, send `request_replay` including the current active `chatThreadId`
- [x] 4.2 Verify `loadChatHistory` is idempotent (DOM wiped and rebuilt) so a double `history` load does not duplicate messages

## 5. Frontend: recover on any unrecoverable gate rejection

- [x] 5.1 In `shouldAcceptStreamingEvent`, remove the `messageElement` precondition on the replay-recovery branch
- [x] 5.2 When `currentPromptId` is null and `replayRequested` is not set, send `request_replay` and set `replayRequested` even when no streaming element exists
- [x] 5.3 When a mismatch has no usable event `promptId`, send `request_replay` (guarded by `replayRequested`) instead of dropping
- [x] 5.4 Confirm `replayRequested` is still cleared in `loadChatHistory` (single-shot per incident)

## 6. Testing

- [x] 6.1 Test server: `ping` yields `pong`
- [x] 6.2 Test frontend: `onopen` starts a heartbeat and sends `ping`
- [x] 6.3 Test frontend: missed pongs force `socket.close()` and clear the interval
- [x] 6.4 Test frontend: reconnect sends `request_replay` for the active thread
- [x] 6.5 Test frontend: gate rejection with null `currentPromptId` and no `messageElement` sends `request_replay`
- [ ] 6.6 Manual repro: send a prompt, force the socket into a half-open state (DevTools offline ~30s), confirm the response appears without a manual reload
- [x] 6.7 Run platform tests: `cd packages/mimo-platform && bun test` (change-relevant tests green; stashed-baseline comparison confirms zero new failures — pre-existing env failures from missing `hono/jsx` modules are unrelated)
- [x] 6.8 Run full platform suite: `cd packages/mimo-platform && bun run test.full` (ran; failures are all pre-existing/environmental — missing `hono/jsx` modules in unit tests, and `integration-test/` needing live infra. The full-vs-unit delta comes solely from `integration-test/`, none of which this change touches)
