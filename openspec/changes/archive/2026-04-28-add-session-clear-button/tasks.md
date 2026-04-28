## 1. UI - Add Clear Button

- [x] 1.1 Add "Clear" button to SessionDetailPage.tsx action bar near Commit button
- [x] 1.2 Add click handler that sends WebSocket message via status line socket
- [x] 1.3 Add system message styling for "Session cleared - context reset" messages

## 2. Frontend - WebSocket Message Handling

- [x] 2.1 Add `clear_session` message sender in chat.js
- [x] 2.2 Add `session_cleared` message handler to display system message in chat
- [x] 2.3 Add `clear_session_error` handler to display error messages

## 3. Platform - Message Routing and Persistence

- [x] 3.1 Add `clear_session` WebSocket handler to forward message to agent
- [x] 3.2 Add `acp_session_cleared` message handler to update session repository
- [x] 3.3 Update session.yaml with new `acpSessionId` via sessionRepository.update()
- [x] 3.4 Append system message to chat.jsonl via existing chat persistence
- [x] 3.5 Broadcast `session_cleared` message to all UI clients via WebSocket
- [x] 3.6 Add error handling for failed clear operations

## 4. Agent - ACP Session Clear Implementation

- [x] 4.1 Add `clear()` method to AcpClient in `mimo-agent/src/acp/client.ts`
- [x] 4.2 Implement create new session using `newSession`
- [x] 4.3 Add `clear_session` message handler in `mimo-agent/src/index.ts`
- [x] 4.4 Send `acp_session_cleared` message with new `acpSessionId` to platform
- [x] 4.5 Send `clear_session_error` message on failure
- [x] 4.6 ~~Use `unstable_closeSession`~~ (Removed - not supported by providers)

## 5. Testing

- [x] 5.1 Test clear button appears in UI when agent is online
- [x] 5.2 Test clear session flow end-to-end (UI → Platform → Agent → Platform → UI)
- [x] 5.3 Test chat history is preserved after clear
- [x] 5.4 Test system message appears in chat after clear
- [x] 5.5 Test acpSessionId is updated in session.yaml after clear
- [x] 5.6 Test error handling when agent doesn't support closeSession
- [x] 5.7 Test agent reconnects with new acpSessionId after clear
