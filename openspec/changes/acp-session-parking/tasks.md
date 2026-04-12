## 1. Session Storage Schema Extension

- [x] 1.1 Add `idleTimeoutMs`, `acpSessionId`, `modelState`, `modeState`, `acpStatus` fields to Session interface in `mimo-platform/src/sessions/repository.ts`
- [x] 1.2 Update session.yaml serialization to include new fields with defaults
- [x] 1.3 Update session.yaml deserialization to handle missing fields (backward compatibility)
- [x] 1.4 Add `updateSessionConfig()` method to session repository for idle timeout updates
- [x] 1.5 Write tests for session storage with new fields

## 2. Session Configuration API

- [x] 2.1 Create PATCH `/sessions/:id/config` endpoint in `mimo-platform/src/sessions/routes.ts`
- [x] 2.2 Add validation for `idleTimeoutMs` (minimum 10000, allow 0 to disable)
- [x] 2.3 Broadcast config change to agent via WebSocket
- [x] 2.4 Write tests for configuration API

## 3. ACP Lifecycle Manager (mimo-agent)

- [x] 3.1 Create `SessionLifecycleManager` class in `mimo-agent/src/` with:
  - Activity tracking per session (last activity timestamp)
  - Idle timeout timer management
  - State machine (ACTIVE → PARKED → WAKING → ACTIVE)
- [x] 3.2 Implement activity event tracking:
  - user_message (from platform)
  - thought_start, thought_chunk, thought_end (from ACP)
  - message_chunk, usage_update (from ACP)
- [x] 3.3 Implement parking logic:
  - Kill ACP process via `sessionManager.terminateSession()`
  - Stop file watcher
  - Cache `acpSessionId`, `modelState`, `modeState`
  - Send status to platform
- [x] 3.4 Implement resumption logic:
  - Respawn ACP process via `spawnAcpProcess()`
  - Call `initialize(cachedAcpSessionId)` to trigger `loadSession()`
  - Restore model/mode from cache
  - Send status to platform
- [x] 3.5 Implement prompt queueing during WAKING state
- [x] 3.6 Write tests for lifecycle manager

## 4. WebSocket Status Messages (mimo-platform)

- [x] 4.1 Add `acp_status` message handling in `mimo-platform/src/index.tsx` WebSocket handlers
- [x] 4.2 Broadcast status changes to all chat clients for a session
- [x] 4.3 Handle status query from agent (`request_acp_status`)
- [x] 4.4 Write tests for status broadcasting

## 5. UI Status Indicator

- [x] 5.1 Add `acp_status` message handler in `mimo-platform/public/js/chat.js`
- [x] 5.2 Create status indicator UI component (active/parked/waking states)
- [x] 5.3 Update model/mode selector enabled state based on ACP status
- [x] 5.4 Disable input and show "Waking agent..." placeholder during WAKING state
- [x] 5.5 Show transient notification for session reset
- [x] 5.6 Write tests for UI state transitions

## 6. Integration & End-to-End Testing

- [x] 6.1 Test parking after idle timeout (verify process killed, resources freed)
- [x] 6.2 Test resumption on new prompt (verify loadSession called, model/mode restored)
- [x] 6.3 Test queueing multiple prompts during wake-up
- [x] 6.4 Test session reset when loadSession fails
- [x] 6.5 Test idle timeout configuration update
- [x] 6.6 Test backward compatibility with existing sessions (no new fields)
- [x] 6.7 Test parking disabled with `idleTimeoutMs: 0`

## 7. Documentation

- [x] 7.1 Update AGENTS.md with ACP session parking behavior
- [x] 7.2 Document idle timeout configuration in API docs
- [x] 7.3 Add troubleshooting guide for session resumption issues
