# Tasks: Chat Threads with Shared Workspace

## 1. Tests First (BDD)

- [ ] 1.1 Add failing integration test: create chat thread spawns dedicated ACP runtime in shared checkout
- [ ] 1.2 Add failing integration test: messages route only to target `chatThreadId`
- [ ] 1.3 Add failing integration test: per-thread model/mode are isolated across threads
- [ ] 1.4 Add failing integration test: reconnect sends streaming state for active thread
- [ ] 1.5 Add failing integration test: programmatic thread creation API works without UI

## 2. Data Model and Persistence

- [ ] 2.1 Add session fields: `activeChatThreadId` and `chatThreads[]`
- [ ] 2.2 Add read-time fallback migration to create default `Main` thread for legacy sessions
- [ ] 2.3 Persist per-thread fields: `name`, `model`, `mode`, `acpSessionId`, `state`

## 3. Platform API

- [ ] 3.1 Implement `GET /sessions/:id/chat-threads`
- [ ] 3.2 Implement `POST /sessions/:id/chat-threads`
- [ ] 3.3 Implement `PATCH /sessions/:id/chat-threads/:threadId`
- [ ] 3.4 Implement `DELETE /sessions/:id/chat-threads/:threadId`
- [ ] 3.5 Implement `POST /sessions/:id/chat-threads/:threadId/activate`

## 4. Agent Runtime Management

- [ ] 4.1 Refactor runtime map key to `{sessionId, chatThreadId}`
- [ ] 4.2 Spawn ACP runtime per thread using shared checkout path
- [ ] 4.3 Restore per-thread model/mode on wake/reconnect
- [ ] 4.4 Close or park thread runtime on thread deletion

## 5. WebSocket Protocol and Routing

- [ ] 5.1 Require `chatThreadId` in user message payloads
- [ ] 5.2 Require `chatThreadId` in stream/thought/usage events
- [ ] 5.3 Update platform and agent handlers to route strictly by `chatThreadId`

## 6. UI (Session Page)

- [ ] 6.1 Replace static chat tab with dynamic chat-thread tabs in left frame
- [ ] 6.2 Add create thread action with name/model/mode inputs
- [ ] 6.3 Add per-thread model selector and mode selector in active thread context
- [ ] 6.4 Preserve active thread state across refresh/reconnect

## 7. Verification

- [ ] 7.1 Run `cd packages/mimo-platform && bun test`
- [ ] 7.2 Run `cd packages/mimo-agent && bun test`
- [ ] 7.3 Run full suites for touched packages if integration behavior changed
