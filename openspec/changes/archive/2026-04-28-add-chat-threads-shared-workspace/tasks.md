# Tasks: Chat Threads with Shared Workspace

## 1. Tests First (BDD)

- [x] 1.1 Add failing integration test: create chat thread spawns dedicated ACP runtime in shared checkout
- [x] 1.2 Add failing integration test: messages route only to target `chatThreadId`
- [x] 1.3 Add failing integration test: per-thread model/mode are isolated across threads
- [x] 1.4 Add failing integration test: reconnect sends streaming state for active thread
- [x] 1.5 Add failing integration test: programmatic thread creation API works without UI
- [x] 1.6 Add failing integration test: activity on one thread prevents other threads from being parked
- [x] 1.7 Add failing integration test: session-level idle timeout parks all threads at once
- [x] 1.8 Add failing integration test: incoming prompt wakes only the targeted thread, others remain parked

## 2. Data Model and Persistence

- [x] 2.1 Add session fields: `activeChatThreadId` and `chatThreads[]`
- [x] 2.2 Add read-time fallback migration to create default `Main` thread for legacy sessions
- [x] 2.3 Persist per-thread fields: `name`, `model`, `mode`, `acpSessionId`, `state`

## 3. Platform API

- [x] 3.1 Implement `GET /sessions/:id/chat-threads`
- [x] 3.2 Implement `POST /sessions/:id/chat-threads`
- [x] 3.3 Implement `PATCH /sessions/:id/chat-threads/:threadId`
- [x] 3.4 Implement `DELETE /sessions/:id/chat-threads/:threadId`
- [x] 3.5 Implement `POST /sessions/:id/chat-threads/:threadId/activate`

## 4. Agent Runtime Management

- [x] 4.1 Refactor runtime map key to `{sessionId, chatThreadId}`
- [x] 4.2 Spawn ACP runtime per thread using shared checkout path
- [x] 4.3 Restore per-thread model/mode on wake/reconnect
- [x] 4.4 Close or park thread runtime on thread deletion
- [x] 4.5 Replace per-thread idle timers with a single session-level idle timer; any inbound prompt on any thread resets it
- [x] 4.6 On session-level idle timeout, park all active thread runtimes for that session
- [x] 4.7 On incoming prompt for a parked thread, wake only that thread; leave other parked threads untouched and restart session-level idle timer once the thread is active

## 5. WebSocket Protocol and Routing

- [x] 5.1 Require `chatThreadId` in user message payloads
- [x] 5.2 Require `chatThreadId` in stream/thought/usage events
- [x] 5.3 Update platform and agent handlers to route strictly by `chatThreadId`

## 6. UI (Session Page)

- [x] 6.1 Replace static chat tab with dynamic chat-thread tabs in left frame
- [x] 6.2 Add create thread action with name/model/mode inputs
- [x] 6.3 Add per-thread model selector and mode selector in active thread context
- [x] 6.4 Preserve active thread state across refresh/reconnect

## 7. Verification

- [x] 7.1 Run `cd packages/mimo-platform && bun test`
- [x] 7.2 Run `cd packages/mimo-agent && bun test`
- [x] 7.3 Run full suites for touched packages if integration behavior changed
