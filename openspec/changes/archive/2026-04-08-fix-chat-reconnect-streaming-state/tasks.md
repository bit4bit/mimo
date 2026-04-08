## 1. Server-side: Send streaming state on reconnect

- [x] 1.1 Modify `chat` WebSocket open handler in `index.tsx` to check `thoughtBuffers` and `streamingBuffers` after sending history
- [x] 1.2 Send `streaming_state` message with `thoughtContent` and `messageContent` if either buffer has content

## 2. Frontend: Handle streaming_state message

- [x] 2.1 Add `streaming_state` case in `handleWebSocketMessage()` in `chat.js`
- [x] 2.2 Reconstruct thought section with accumulated `thoughtContent`
- [x] 2.3 Append accumulated `messageContent` to response area
- [x] 2.4 Track streaming state to prevent editable bubble creation until `usage_update`

## 3. Tests

- [x] 3.1 Add integration tests for streaming state on reconnect
