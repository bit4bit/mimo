## Context

The chat frontend maintains streaming state in global `ChatState` variables (`streaming`, `pendingMessages`). When switching threads, the DOM is wiped (`container.innerHTML = ""`) but these state references are not cleared. This causes:

1. **Ghost DOM nodes**: `ChatState.streaming.messageElement` references a detached node after `loadChatHistory` clears the DOM. Subsequent `message_chunk` or `streaming_state` updates append content to the invisible node.
2. **Pending message leak**: `ChatState.pendingMessages` is a global `Set`. Messages sent on Thread A before switching to Thread B are never removed from the set, causing duplicate suppression when returning to Thread A.
3. **Lost cancelled messages**: When a streaming response is cancelled before any chunks arrive, the server returns `null` from `buildAndClearAssistantContent` and nothing is persisted. The frontend shows "Cancelled" locally, but on thread reactivation no message exists.

## Goals / Non-Goals

**Goals:**

- Ensure streaming content is always visible after thread switches
- Prevent pending message tracking from leaking across threads
- Ensure cancelled messages survive thread switches and page reloads
- Maintain all existing behavior for non-switching scenarios

**Non-Goals:**

- Redesigning the entire streaming architecture
- Adding new WebSocket message types
- Changing the server-side buffering strategy

## Decisions

### 1. Clear streaming state in `loadChatHistory`

When `loadChatHistory` rebuilds the DOM from persisted messages, it SHALL reset `ChatState.streaming` to its initial state. This is the minimal fix for the ghost node problem.

**Rationale**: `loadChatHistory` is the single point where the DOM is reconstructed from server state. Clearing frontend streaming state here ensures consistency.

**Alternative considered**: Clear state in `prepareThreadSwitch`. Rejected because `prepareThreadSwitch` is called asynchronously after `activeThreadId` updates, leaving a window where chunks can create ghost nodes.

### 2. Guard `handleStreamingState` with `isConnected` check

Before reusing an existing `messageElement`, verify it is still in the DOM using `element.isConnected`.

**Rationale**: Defensive programming. Even after fixing `loadChatHistory`, other code paths might detach nodes.

### 3. Clear `pendingMessages` in `prepareThreadSwitch`

When switching threads, clear the global `pendingMessages` set.

**Rationale**: Messages sent on the outgoing thread that haven't been echoed yet will never be echoed to the outgoing thread (the user has left it). Keeping them causes false duplicate detection on return.

**Alternative considered**: Make `pendingMessages` per-thread. Rejected as over-engineering — the set is only needed briefly between send and echo.

### 4. Persist empty cancellations on server

In `flushAsCancelled`, if `buildAndClearAssistantContent` returns `null`, create an empty assistant message and save it.

**Rationale**: The user action of cancelling is itself meaningful state. An empty assistant message with a cancelled indicator preserves this.

**Trade-off**: Adds a message to history that has no content. The UI already handles displaying "Cancelled" for such messages.

## Risks / Trade-offs

| Risk                                                                                                           | Mitigation                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clearing streaming state in `loadChatHistory` might interfere with legitimate streaming during history loading | `loadChatHistory` is only called after `request_replay`, which is sent during thread switches. Active streaming on the current thread would have been handled before the switch. |
| Persisting empty cancellations increases message count                                                         | Empty messages are filtered from normal display; only the "Cancelled" indicator is shown.                                                                                        |
| `pendingMessages` clear might suppress legitimate duplicates                                                   | The window between send and echo is typically < 1s. Thread switching during this window is rare.                                                                                 |

## Migration Plan

No migration needed. This is a frontend and server behavior fix with no data schema changes.
