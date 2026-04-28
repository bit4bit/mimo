## 1. mimo-agent Changes

- [x] 1.1 Add `currentThoughtBuffer` field to SessionInfo interface
- [x] 1.2 Update sessionUpdate handler to parse ACP update types
- [x] 1.3 Filter out available_commands_update events
- [x] 1.4 Emit thought_start/thought_chunk/thought_end events
- [x] 1.5 Emit message_chunk events for agent responses
- [x] 1.6 Emit usage_update events for cost data
- [x] 1.7 Clear thought buffer on process close

## 2. mimo-platform Backend Changes

- [x] 2.1 Add handlers for thought_start/thought_chunk/thought_end message types
- [x] 2.2 Add handler for message_chunk message type
- [x] 2.3 Add handler for usage_update message type
- [x] 2.4 Forward structured events to WebSocket clients

## 3. mimo-platform Frontend Changes

- [x] 3.1 Update chat.js handleWebSocketMessage for new message types
- [x] 3.2 Implement collapsible thought section UI
- [x] 3.3 Implement streaming message display
- [x] 3.4 Add usage display under Send button
- [x] 3.5 Add #chat-usage element to SessionDetailPage.tsx

## 4. Testing & Deployment

- [x] 4.1 Test thought grouping and collapsing
- [x] 4.2 Test message streaming without JSON wrapper
- [x] 4.3 Test usage display shows correctly
- [x] 4.4 Verify available_commands_update is hidden
- [x] 4.5 Build and deploy mimo-agent
- [x] 4.6 Build and deploy mimo-platform
