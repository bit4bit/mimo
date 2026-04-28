## 1. ACP Client — permission callback

- [x] 1.1 Add `onPermissionRequest` to `AcpClientCallbacks` in `packages/mimo-agent/src/acp/client.ts`: `(sessionId: string, requestId: string, params: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse>`
- [x] 1.2 Replace the hardcoded `requestPermission` handler in `AcpClient.initialize()` with one that generates a `crypto.randomUUID()` requestId and calls `this.callbacks.onPermissionRequest(this.sessionId, requestId, params)`

## 2. MimoAgent — pending permissions map and platform routing

- [x] 2.1 Add `pendingPermissions: Map<string, (r: acp.RequestPermissionResponse) => void>` field to `MimoAgent` in `packages/mimo-agent/src/index.ts`
- [x] 2.2 Implement `onPermissionRequest` callback in the `AcpClientCallbacks` object passed to `AcpClient`: store the Promise resolver in `pendingPermissions`, send `{ type: "permission_request", sessionId, requestId, toolCall: params.toolCall, options: params.options }` to the platform WebSocket
- [x] 2.3 Add `permission_response` case to `handlePlatformMessage` in `MimoAgent`: look up `requestId` in `pendingPermissions`, resolve with `{ outcome: data.outcome }`, delete from map

## 3. Platform — agent↔chat routing

- [x] 3.1 Add `pendingPermissions: Map<string, WebSocket>` (requestId → agentWs) to module-level state in `packages/mimo-platform/src/index.tsx`
- [x] 3.2 Add `permission_request` case to `handleAgentMessage`: store `requestId → ws` in `pendingPermissions`, broadcast `{ type: "permission_request", requestId, toolCall, options }` to all chat subscribers for the session
- [x] 3.3 Add `permission_response` case to `handleChatMessage`: look up `requestId` in `pendingPermissions`, send `{ type: "permission_response", requestId, outcome: { outcome: "selected", optionId: data.optionId } }` to the agent WebSocket, delete from `pendingPermissions`, broadcast `{ type: "permission_resolved", requestId }` to all chat subscribers for the session
- [x] 3.4 In the WebSocket `close` handler for chat connections: when the subscriber Set for a session becomes empty, iterate all entries in `pendingPermissions` that belong to that session and send `{ type: "permission_response", requestId, outcome: { outcome: "cancelled" } }` to each stored agentWs, then delete those entries

## 4. Frontend — approval card in chat.js

- [x] 4.1 Add `permission_request` case in `packages/mimo-platform/public/js/chat.js` message handler: render an inline approval card element in the chat message list containing the tool title, kind, file locations, and one button per option
- [x] 4.2 On option button click: send `{ type: "permission_response", requestId, optionId }` via the chat WebSocket, remove the card from the DOM
- [x] 4.3 Add `permission_resolved` case: find the card for the given `requestId` and remove it (handles multi-tab dismissal)

## 5. Tests

- [x] 5.1 Unit test: `AcpClient` calls `onPermissionRequest` callback with a UUID requestId when `requestPermission` fires
- [x] 5.2 Integration test: agent sends `permission_request` to platform when ACP calls `requestPermission`; platform broadcasts it to chat subscribers
- [x] 5.3 Integration test: chat sends `permission_response`; platform routes to agent; agent resolves the pending Promise
- [x] 5.4 Integration test: last chat client disconnects with pending request; platform sends `cancelled` outcome to agent
