## Context

The Mimo platform uses the Agent Client Protocol (ACP) to communicate with AI agents. Each mimo session maintains:
- A unique mimo session ID (persistent, stored in session.yaml)
- An ACP session ID (transient, stored in session.yaml as acpSessionId)
- Chat history (stored in chat.jsonl)

Currently, there's no way to clear/reset the ACP agent's context without creating a new mimo session, which would lose the chat history. The ACP SDK provides `unstable_closeSession` to close an existing session and `newSession` to create a new one.

The clear session feature needs to:
1. Preserve the mimo session ID and chat history
2. Close the existing ACP session
3. Create a new ACP session
4. Update the acpSessionId in session.yaml
5. Add a system message to chat.jsonl indicating the clear

## Goals / Non-Goals

**Goals:**
- Allow users to clear/reset ACP session context while preserving chat history
- Provide visual feedback in the chat UI when session is cleared
- Update the persisted acpSessionId so the new session can be resumed on reconnect
- Make the clear action accessible from the chat interface

**Non-Goals:**
- Clear chat history (history is preserved intentionally)
- Modify any other session state beyond acpSessionId
- Support undo/redo of clear action
- Add clear to the public API (UI only for now)

## Decisions

### 1. Create New Session Pattern
**Decision:** Create a new ACP session using `newSession` rather than attempting to close the old session first.

**Rationale:** The ACP SDK doesn't provide a reliable `closeSession` method that works across all providers. Creating a new session effectively resets the agent's context by starting fresh. The old session will be abandoned, but since the agent uses the new session ID for all future prompts, the context is effectively cleared.

### 2. WebSocket Message Flow
**Decision:** Use WebSocket messages between platform and agent:
- Platform → Agent: `clear_session`
- Agent → Platform: `acp_session_cleared` (with new acpSessionId)
- Platform → UI: Broadcast via WebSocket

**Rationale:** This follows the existing pattern for session management (session_ready, acp_session_created, etc.) and keeps the platform as the source of truth for session state.

### 3. System Message Format
**Decision:** Append a system message to chat.jsonl with content "Session cleared - context reset".

**Rationale:** This provides a clear marker in the chat history showing when context was cleared, similar to how system messages work in other chat platforms.

### 4. Button Placement
**Decision:** Place the "Clear" button near the "Cancel" button in the action bar below the chat buffer.

**Rationale:** This groups session control actions together and makes them easily accessible without cluttering the main UI.

### 5. Error Handling
**Decision:** If clear fails, show an error message in the chat but don't roll back - the old ACP session is already closed.

**Rationale:** The old session is unusable after attempting close, so we can't "undo" a failed clear. The user would need to reload the page or the agent would need to reconnect.

## Risks / Trade-offs

**[Risk] Agent doesn't support closeSession capability**
→ **Mitigation:** Check capabilities before attempting clear. If not supported, show error message and don't attempt close.

**[Risk] Clear fails partway through (close succeeds, newSession fails)**
→ **Mitigation:** The agent will be in an inconsistent state. UI should show error and suggest refreshing the page. New ACP session will be created on next agent reconnect.

**[Risk] User clears accidentally**
→ **Mitigation:** No undo capability by design. The system message provides clear feedback that clear happened. Consider adding confirmation dialog in future if this becomes an issue.

**[Trade-off] History preservation vs. context reset**
The user can still see the full history, but the agent won't remember the context from before the clear. This is the intended behavior but may confuse some users.
