## Why

ACP (Agent Client Protocol) providers like opencode and claude-agent-acp keep their processes running indefinitely, consuming system resources even when no active conversation is happening. This leads to unnecessary memory and CPU usage, especially when users have multiple sessions open but are only actively using one. We need a way to automatically "park" idle ACP sessions after a configurable timeout, freeing resources while maintaining a seamless user experience.

## What Changes

- **Per-session idle timeout configuration**: Add `idleTimeoutMs` field to session storage (persisted to disk in `session.yaml`, default: 10 minutes)
- **ACP session caching**: Cache `acpSessionId`, `modelState`, and `modeState` in mimo-platform when ACP is parked
- **Smart session parking in mimo-agent**: 
  - Monitor activity (user prompts, ACP messages/thoughts)
  - Kill ACP process after idle timeout
  - Stop file watcher to save resources
- **Transparent session resumption**:
  - Respawn ACP process when new prompt arrives
  - Attempt `loadSession()` with cached `acpSessionId` (works for both opencode and claude)
  - Restore model/mode from cached state
  - Queue prompts that arrive during wake-up
- **UI status indicator**: Show subtle indicator of ACP state (active/parked/waking) in chat interface
- **Error handling**: Show message if session resumption fails, fall back to fresh session

## Capabilities

### New Capabilities
- `acp-session-parking`: Automatic idle detection and resource cleanup for ACP processes
- `acp-session-resumption`: Transparent session restoration with cached configuration
- `session-idle-config`: Per-session idle timeout configuration API

### Modified Capabilities
- `session-management`: Add `idleTimeoutMs`, `acpSessionId`, `modelState`, `modeState` to session storage schema
- `chat-streaming-state`: Add ACP status indicator to chat UI

## Impact

- **mimo-platform**: Session repository changes (new fields), WebSocket messages for ACP status, configuration API
- **mimo-agent**: New session lifecycle manager (parking/resumption logic), activity tracking per session, prompt queueing during wake-up
- **UI**: New status indicator component, handling for "parked" and "waking" states
- **Disk storage**: Session YAML schema extension (backward compatible - new fields are optional with defaults)
