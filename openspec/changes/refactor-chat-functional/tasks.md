## 1. Setup

- [ ] 1.1 Backup original chat.js
- [ ] 1.2 Create new chat.js with section headers and structure

## 2. State Module

- [ ] 2.1 Define ChatState global object with all current state variables
- [ ] 2.2 Add state accessor functions (getState, setters)

## 3. Views Module

- [ ] 3.1 Create renderConnectionStatus function
- [ ] 3.2 Create renderMessage function
- [ ] 3.3 Create renderThoughtSection function
- [ ] 3.4 Create renderEditableBubble function
- [ ] 3.5 Create renderStreamingMessage function
- [ ] 3.6 Create renderAgentStatus function
- [ ] 3.7 Create renderUsage function
- [ ] 3.8 Create renderNotification function
- [ ] 3.9 Create renderPermissionCard function

## 4. Services Module

- [ ] 4.1 Create parseMessageContent function
- [ ] 4.2 Create parseHistoryMessage function
- [ ] 4.3 Create buildWebSocketUrl function
- [ ] 4.4 Create calculateCombinedStatus function
- [ ] 4.5 Create formatUsage function

## 5. Controller Module

- [ ] 5.1 Create initChat function
- [ ] 5.2 Create connectWebSocket function
- [ ] 5.3 Create handleWebSocketMessage switch statement
- [ ] 5.4 Create all handle* action functions
- [ ] 5.5 Create sendMessage and sendMessageHttp functions
- [ ] 5.6 Create cancelStreaming function
- [ ] 5.7 Create clearSession function
- [ ] 5.8 Create streaming timeout functions

## 6. DOM Manipulation Module

- [ ] 6.1 Create insertMessage function
- [ ] 6.2 Create insertEditableBubble function
- [ ] 6.3 Create removeEditableBubble function
- [ ] 6.4 Create submitEditableBubble function
- [ ] 6.5 Create insertStreamingMessage function
- [ ] 6.6 Create removeStreamingMessage function
- [ ] 6.7 Create finalizeMessageStream function
- [ ] 6.8 Create insertThoughtSection function
- [ ] 6.9 Create updateThoughtContent function
- [ ] 6.10 Create finalizeThoughtSection function
- [ ] 6.11 Create updateMessageContent function
- [ ] 6.12 Create updateUsageDisplay function
- [ ] 6.13 Create updateConnectionStatusUI function
- [ ] 6.14 Create updateAgentStatusUI function
- [ ] 6.15 Create showNotification function
- [ ] 6.16 Create insertError function
- [ ] 6.17 Create insertCancelledMessage function
- [ ] 6.18 Create insertTimeoutWarning function
- [ ] 6.19 Create insertPendingClearMessage function
- [ ] 6.20 Create loadChatHistory function
- [ ] 6.21 Create updateModelSelector function
- [ ] 6.22 Create updateModeSelector function
- [ ] 6.23 Create showPermissionCard function
- [ ] 6.24 Create removePermissionCard function
- [ ] 6.25 Create handleStreamingState function
- [ ] 6.26 Create handleSessionCleared function
- [ ] 6.27 Create handleClearSessionError function
- [ ] 6.28 Create scrollToBottom function

## 7. Setup and Bootstrap

- [ ] 7.1 Create setupEventListeners function
- [ ] 7.2 Create public API (window.MIMO_CHAT)
- [ ] 7.3 Add animation styles and DOMContentLoaded handler

## 8. Verification

- [ ] 8.1 Verify all original functionality preserved
- [ ] 8.2 Test WebSocket connection
- [ ] 8.3 Test message sending/receiving
- [ ] 8.4 Test streaming and thoughts
- [ ] 8.5 Test cancel functionality
- [ ] 8.6 Test session clearing
- [ ] 8.7 Test permission cards
- [ ] 8.8 Test model/mode selectors
- [ ] 8.9 Test reconnection handling
