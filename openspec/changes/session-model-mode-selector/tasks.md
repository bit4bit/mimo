# Tasks: Session Model and Mode Selector

## 1. Mimo-Agent: Capture and Forward ConfigOptions

- [x] 1.1 Extend newSession() in mimo-agent/src/index.ts to capture configOptions from NewSessionResponse
- [x] 1.2 Create extractModelState() function to parse configOptions with category "model"
- [x] 1.3 Create extractModeState() function to parse configOptions with category "mode"
- [x] 1.4 Send session_initialized WebSocket message with modelState and modeState to platform

## 2. Mimo-Agent: Handle Model/Mode Change Requests

- [x] 2.1 Add WebSocket message handler for "set_model" messages from platform
- [x] 2.2 Add WebSocket message handler for "set_mode" messages from platform
- [x] 2.3 Implement setSessionConfigOption call to ACP server with correct optionId mapping
- [x] 2.4 Handle ACP response and forward updated configOptions to platform

## 3. Mimo-Platform: WebSocket Protocol and State Management

- [x] 3.1 Define TypeScript types for modelState and modeState in session types
- [x] 3.2 Add modelState and modeState fields to in-memory session store
- [x] 3.3 Handle session_initialized message from mimo-agent
- [x] 3.4 Implement "set_model" message forwarding from UI to mimo-agent
- [x] 3.5 Implement "set_mode" message forwarding from UI to mimo-agent
- [x] 3.6 Broadcast model_state and mode_state messages to UI clients
- [x] 3.7 Create sessionStateService for shared state access between routes and WebSocket handlers

## 4. Mimo-Platform: UI Components

- [x] 4.1 Create ModelSelector.tsx component with dropdown
- [x] 4.2 Create ModeSelector.tsx component with dropdown
- [x] 4.3 Add selectors to SessionDetailPage header alongside existing session info
- [x] 4.4 Style selectors to match existing UI design
- [x] 4.5 Show/hide selectors based on availability of configOptions

## 5. Mimo-Platform: Frontend WebSocket Integration

- [x] 5.1 Extend chat.js to handle model_state WebSocket messages
- [x] 5.2 Extend chat.js to handle mode_state WebSocket messages
- [x] 5.3 Send set_model message when user changes model selection
- [x] 5.4 Send set_mode message when user changes mode selection
- [x] 5.5 Update dropdown state when receiving state updates from server

## 6. Integration and Testing

- [x] 6.1 Test session creation with opencode ACP server and verify configOptions extraction
- [x] 6.2 Test model selector population and default selection
- [x] 6.3 Test mode selector population and default selection
- [x] 6.4 Test model change flow end-to-end (UI → Platform → Agent → ACP)
- [x] 6.5 Test mode change flow end-to-end (UI → Platform → Agent → ACP)
- [x] 6.6 Test behavior when configOptions are missing (selectors should not appear)
- [x] 6.7 Test model/mode change during active agent turn

## 7. Documentation and Polish

- [x] 7.1 Add inline comments explaining configOptions extraction logic
- [x] 7.2 Add tooltips showing model/mode descriptions on hover
- [x] 7.3 Handle edge case: grouped options (flatten for now)
- [x] 7.4 Add visual feedback during model/mode change (loading spinner)
- [x] 7.5 Update README or documentation if needed

## 8. Bug Fixes

- [x] 8.1 Fixed selectors not appearing because they were conditionally rendered - now always rendered but hidden until state received
