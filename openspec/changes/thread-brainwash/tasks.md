## 1. Data Model — Add brainWash to ChatThread

- [x] 1.1 Add `brainWash: boolean` field to `ChatThread` interface in `packages/mimo-platform/src/domain/sessions/repository.ts`
- [x] 1.2 Add `brainWash` to `updateChatThread` updatable fields in the `Partial<Pick<...>>` type
- [x] 1.3 Add `brainWash` to thread creation in `addChatThread` method (default `false`)
- [x] 1.4 Add `brainWash` to the API route schema for `PATCH /sessions/:id/chat-threads/:threadId` in `packages/mimo-platform/src/api/sessions.ts` (or wherever the route is defined)

## 2. Platform WebSocket — Forward brainWash to agent

- [x] 2.1 Include `brainWash` in `request_state` WebSocket handler in `packages/mimo-platform/src/api/websocket/handlers.ts`
- [x] 2.2 Include `brainWash` in `session_ready` thread bootstrap in `packages/mimo-platform/src/domain/agents/message-router.ts`

## 3. Agent — Store and use brainWash in threadConfigs

- [x] 3.1 Extend `threadConfigs` type in `packages/mimo-agent/src/index.ts` to include `brainWash?: boolean`
- [x] 3.2 Populate `brainWash` in threadConfigs from `session_ready` bootstrap handler
- [x] 3.3 Populate `brainWash` in threadConfigs from `request_state` handler
- [x] 3.4 In `buildAcpCallbacks().onPermissionRequest`, check `threadConfigs.get(key)?.brainWash` before sending to browser
- [x] 3.5 When brainWash is true, resolve with `{ outcome: "selected", optionId: "always_allow" }` if available in params.options, else fall back to first approval optionId
- [x] 3.6 Broadcast `permission_auto_allowed` message to platform when auto-resolving (so browser can show indicator)

## 4. Browser UI — Brain-wash checkbox in thread header

- [x] 4.1 Add brain-wash checkbox to `updateThreadContextUI()` in `packages/mimo-platform/public/js/chat-threads.js`, between mode selector and action buttons
- [x] 4.2 Style checkbox to match existing thread header aesthetic (dark theme, monospace)
- [x] 4.3 On checkbox toggle, send PATCH to update thread with `{ brainWash: checked }` via existing `updateThread()` API
- [x] 4.4 Ensure checkbox state is re-rendered correctly when switching between threads
- [x] 4.5 Send `set_brainwash` WebSocket message on checkbox toggle (same pattern as `set_model`/`set_mode`)

## 5. Platform WebSocket — Handle set_brainwash

- [x] 5.1 Add `set_brainwash` case in browser WebSocket handler (`packages/mimo-platform/src/api/websocket/handlers.ts`) to forward to agent
- [x] 5.2 Add `handleSetBrainwash` method in agent (`packages/mimo-agent/src/index.ts`) to update `threadConfigs` in real-time

## 6. Browser UI — Auto-approval indicator in chat

- [x] 6.1 Handle `permission_auto_allowed` WebSocket message in `packages/mimo-platform/public/js/chat.js`
- [x] 6.2 Render an inline indicator card showing the tool name that was auto-allowed (distinct styling from normal permission card — no buttons, just informational)

## 7. Tests

- [x] 7.1 Write integration test: brainWash enabled → permission request auto-resolved without browser interaction
- [x] 7.2 Write integration test: brainWash disabled → permission request follows normal browser round-trip
- [x] 7.3 Write integration test: brainWash persists across session restart
- [x] 7.4 Write integration test: brainWash is per-thread (one on, one off in same session)
- [x] 7.5 Write unit test: `updateChatThread` accepts and persists `brainWash` field