## Why

Users need a way to clear the ACP agent's context/memory while preserving the chat history. Currently, there's no way to make the agent "forget" previous conversation context without creating an entirely new session, which would lose the chat history. A "Clear" button will allow users to reset the agent's state while keeping the conversation record intact.

## What Changes

- Add a "Clear" button to the chat interface in `SessionDetailPage.tsx`
- Implement WebSocket message handling for `clear_session` in the platform's chat.js
- Add `clear_session` handler in `mimo-agent/src/index.ts` that:
  - Creates a new ACP session using `newSession`
  - Sends the new `acpSessionId` back to the platform
- Add `clear()` method to `AcpClient` in `mimo-agent/src/acp/client.ts`
- Update platform to handle `acp_session_cleared` message and persist new `acpSessionId` to `session.yaml`
- Append a system message "Session cleared - context reset" to `chat.jsonl` when clear is triggered
- Display the system message in the chat UI

## Capabilities

### New Capabilities
- `session-clear`: Ability to clear/reset an ACP session while preserving chat history and mimo session state

### Modified Capabilities
- None (this is purely a new feature that doesn't change existing spec-level requirements)

## Impact

- **UI**: `packages/mimo-platform/src/components/SessionDetailPage.tsx` - Add "Clear" button
- **Frontend**: `packages/mimo-platform/public/js/chat.js` - Add WebSocket message handler
- **Agent Core**: `packages/mimo-agent/src/index.ts` - Handle clear_session message
- **ACP Client**: `packages/mimo-agent/src/acp/client.ts` - Add clear() method
- **Platform Service**: `packages/mimo-platform/src/sessions/` - Handle acp_session_cleared, update repository
- **Storage**: `session.yaml` - acpSessionId will be updated when session is cleared
- **Chat History**: `chat.jsonl` - System message appended on clear
