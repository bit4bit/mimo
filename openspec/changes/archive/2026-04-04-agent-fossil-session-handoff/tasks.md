# Tasks: agent-fossil-session-handoff

## 1. Platform - Session Creation Changes

- [x] 1.1 Remove `openFossilCheckout` call from session creation in `sessions/routes.tsx`
- [x] 1.2 Update session creation to store `port: null` in session.yaml
- [x] 1.3 Update session creation test to verify repo.fossil created but not checkout
- [x] 1.4 Verify session-bootstrap.test.ts covers new behavior

## 2. Platform - Agent Handshake Changes

- [x] 2.1 Add `workdir` field to agent_ready message parsing in `index.tsx`
- [x] 2.2 Store agent workdir in agent context when agent connects
- [x] 2.3 Update session_ready message to include `platformUrl` for each session
- [x] 2.4 Ensure fossil server is started for each active session when agent connects
- [x] 2.5 Update session_ready to send only sessionId and port (simplified from sending checkoutPath)

## 3. Platform - Tests

- [x] 3.1 Add test for session_ready message format with multiple sessions
- [x] 3.2 Add test for relative path computation (various path scenarios)
- [x] 3.3 Add test for agent with empty sessions list
- [x] 3.4 Update existing agent WebSocket tests for new message format

## 4. Agent - Dependencies

- [x] 4.1 Add `@agentclientprotocol/sdk` to `packages/mimo-agent/package.json`
- [x] 4.2 Run `bun install` in mimo-agent package
- [x] 4.3 Verify SDK provides necessary ACP communication interfaces

## 5. Agent - Session Management

- [x] 5.1 Create `SessionContext` interface in agent
- [x] 5.2 Add `sessions: Map<string, SessionContext>` to MimoAgent class
- [x] 5.3 Add `workdir` field to AgentConfig interface
- [x] 5.4 Include `workdir` in `agent_ready` message
- [x] 6.1 Add `session_ready` case to `handleMessage` switch statement
- [x] 6.2 Implement `setupSession(session)` method
- [x] 6.3 Implement `cloneFossil(session)` to run `fossil clone http://localhost:<port> <checkoutPath>`
- [x] 6.4 Implement `openExistingCheckout(session)` for reconnection scenario
- [x] 6.5 Add error handling and logging for clone failures
- [x] 6.6 Send `agent_sessions_ready` message after all sessions processed
- [x] 7.1 Import and initialize `@agentclientprotocol/sdk` in agent
- [x] 7.2 Implement `spawnAcpProcess(session)` in checkout directory
- [x] 7.3 Store ACP process reference in SessionContext
- [x] 7.4 Handle ACP process exit/crash events
- [x] 7.5 Implement `terminateSession(sessionId)` to kill ACP process
- [x] 8.1 Add `fileWatcher` to SessionContext interface
- [x] 8.2 Start file watcher per session after checkout ready
- [x] 8.3 Include `sessionId` in `file_changed` messages
- [x] 8.4 Handle file watcher close on session termination
- [x] 9.1 Update `user_message` handler to route to correct session ACP
- [x] 9.2 Update `acp_request` handler to include sessionId
- [x] 9.3 Ensure `acp_response` includes correct sessionId
- [x] 9.4 Handle messages for unknown sessionId with warning log

## 10. Agent - Tests

- [x] 10.1 Add test for session_ready message handling
- [x] 10.2 Add test for multi-session state management
- [x] 10.3 Add mock test for fossil clone command execution
- [x] 10.4 Add test for checkout path derivation from sessionId
- [x] 10.5 Add test for ACP spawn per session
- [x] 10.6 Add test for file watcher per session

## 11. Integration Tests

- [x] 11.1 Test full flow: session creation → agent connect → fossil start → session_ready → agent bootstrap
- [x] 11.2 Test agent reconnect with existing checkout (no re-clone)
- [x] 11.3 Test multi-session agent (3 sessions, multiple ACP processes)
- [x] 11.4 Test session deletion while agent connected (cleanup fossil server, notify agent)
- [x] 11.5 Test checkout path outside workdir scenario

## 12. Documentation

- [x] 12.2 Update mimo-agent README with multi-session support
- [x] 12.1 Update README.md with session handoff architecture
- [x] 12.3 Document session_ready message format in protocol docs
- [x] 12.4 Add troubleshooting guide for clone failures