## 1. mimo-platform: Session Repository

- [x] 1.1 Add acpSessionId field to Session interface in sessions/repository.ts
- [x] 1.2 Update session.yaml read/write logic to handle acpSessionId (optional)
- [x] 1.3 Add acpSessionId parameter to SessionRepository.update() method

## 2. mimo-platform: WebSocket Protocol - Send acpSessionId

- [x] 2.1 Update session_ready message handler to read acpSessionId from session.yaml
- [x] 2.2 Include acpSessionId in session objects within session_ready message
- [x] 2.3 Handle null/missing acpSessionId gracefully (send null)

## 3. mimo-platform: WebSocket Protocol - Receive acp_session_created

- [x] 3.1 Add handler for acp_session_created message from agent
- [x] 3.2 Extract sessionId, acpSessionId, wasReset, resetReason from message
- [x] 3.3 Update session.yaml with new acpSessionId via repository
- [x] 3.4 If wasReset is true, append system message to chat.jsonl

## 4. mimo-platform: Chat Service - System Messages

- [x] 4.1 Create function to append system message to chat history
- [x] 4.2 Format: "Session reset at YYYY-MM-DD HH:MM:SS (reason)"
- [x] 4.3 Include system message in chat history display

## 5. mimo-agent: AcpClient - Capability Detection

- [x] 5.1 Check agentCapabilities.loadSession in initialize() response
- [x] 5.2 Store capabilities in AcpClient instance
- [x] 5.3 Handle missing capabilities (undefined) as false
- [x] 6.1 Add loadSession() method to AcpClient
- [x] 6.2 Call loadSession({sessionId, cwd, mcpServers}) when capability exists and acpSessionId provided
- [x] 6.3 Handle loadSession errors (fallback to newSession)
- [x] 6.4 Return result indicating success/failure and session ID
- [x] 7.1 Modify initialize() to accept optional existingSessionId parameter
- [x] 7.2 Implement capability-aware logic:
  - If loadSession supported AND existingSessionId: try loadSession first
  - If loadSession fails OR not supported: use newSession
- [x] 7.3 Return result with {acpSessionId, wasReset, resetReason?}

## 8. mimo-agent: WebSocket Handler - Receive acpSessionId

- [x] 8.1 Parse acpSessionId from session_ready message
- [x] 8.2 Store in SessionInfo alongside other session metadata
- [x] 8.3 Pass acpSessionId to AcpClient.initialize()
- [x] 9.1 After ACP session initialization, send acp_session_created message
- [x] 9.2 Include sessionId, acpSessionId, wasReset, resetReason (if any)
- [x] 9.3 Set wasReset=true when newSession used despite having existing ID and loadSession support

## 10. Testing

- [ ] 10.1 Test scenario: Agent with loadSession support resumes session
- [ ] 10.2 Test scenario: Agent without loadSession support creates new session
- [ ] 10.3 Test scenario: Invalid/stale acpSessionId handled gracefully
- [ ] 10.4 Test scenario: System message appears on session reset
- [ ] 10.5 Test backward compatibility: old agent without acp_session_created support
