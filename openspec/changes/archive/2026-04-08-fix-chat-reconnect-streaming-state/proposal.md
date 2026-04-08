## Why

When a user refreshes the chat page while an agent is actively responding, the browser loses the streaming state. On reconnect, the chat history only contains the user message (since the assistant response isn't persisted until `usage_update`), causing the input box to not reappear until the agent finishes and sends `usage_update`.

## What Changes

- **Server sends current streaming state on reconnect**: When a chat WebSocket reconnects, the server checks `thoughtBuffers` and `streamingBuffers` for any in-progress content and sends it to the client
- **Frontend reconstructs streaming state**: Client receives and displays the buffered content, showing the agent box with accumulated thought/message content

## Capabilities

### New Capabilities
- `chat-streaming-state`: Capability for preserving and reconstructing in-progress streaming state on page refresh/reconnect

### Modified Capabilities
<!-- No spec-level behavior changes - this is a bug fix within existing streaming behavior -->

## Impact

- **Backend**: `index.tsx` - Modified `chat` WebSocket open handler to send streaming state
- **Frontend**: `chat.js` - New `streaming_state` message handler to reconstruct UI state
