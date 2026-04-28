## Why

When the agent runs a tool (file edits, shell commands, etc.), it currently auto-approves every action without user awareness. Users need visibility and control over what the agent does to their files and environment.

## What Changes

- Remove hardcoded auto-approval in `AcpClient.requestPermission`; route all tool approval requests to the chat UI instead
- Add `onPermissionRequest` callback to `AcpClientCallbacks` so `MimoAgent` can handle the request and await user response
- Add `permission_request` and `permission_response` WebSocket message types to the agent↔platform and platform↔chat pipelines
- Platform tracks pending permission requests and routes chat responses back to the correct agent connection
- Chat UI renders an inline approval card with tool details and all permission options returned by the ACP SDK
- Auto-reject pending requests when the last chat client for a session disconnects
- Broadcast `permission_resolved` to all chat clients so duplicate approval cards across multiple tabs dismiss automatically
- Applies to all ACP providers (opencode and claude)

## Capabilities

### New Capabilities

- `tool-approval`: Interactive tool permission flow — agent requests approval, user sees inline card in chat, response is routed back to unblock the agent

### Modified Capabilities

- `session-management`: Session now tracks pending permission requests; disconnecting all chat clients cancels them

## Impact

- `packages/mimo-agent/src/acp/client.ts` — new callback, new pending requests map
- `packages/mimo-agent/src/index.ts` — implement `onPermissionRequest`, handle `permission_response` from platform
- `packages/mimo-platform/src/index.tsx` — two new agent message types, two new chat message types, pending request tracking, disconnect-triggered auto-reject
- `packages/mimo-platform/public/js/chat.js` — approval card rendering, option buttons, `permission_resolved` dismissal
