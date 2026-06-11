## Why

Users working in trusted contexts (e.g., a known repository, a review thread, a test environment) find repeated tool-approval prompts disruptive. They need a way to pre-approve all tool calls for a specific chat thread so the agent can work without interruption. A per-thread toggle is more granular than a global "allow all" config and safer than disabling the permission system entirely.

## What Changes

- Add a `brainWash` boolean field to `ChatThread`
- Render a "Brain-wash" checkbox in the thread header UI (between mode selector and action buttons)
- When toggled, persist the setting via existing `updateChatThread` API
- Forward the `brainWash` flag from platform to agent during thread bootstrap and state requests
- In the agent's `onPermissionRequest` callback, when brain-wash is enabled for the current thread, auto-resolve the permission request with the "Allow Always" option (or "Allow Once" if "Always Allow" is unavailable), skipping the browser round-trip entirely
- Optionally broadcast a lightweight "permission_auto_allowed" message so the browser can show an inline indicator

## Capabilities

### New Capabilities
- `thread-brainwash`: Per-thread toggle to auto-approve all tool permission requests for that thread

### Modified Capabilities
- `tool-approval`: Brain-wash adds a server-side auto-resolution path before the existing browser round-trip
- `chat-threads`: ChatThread gains a `brainWash` boolean field, persisted in session YAML and passed through thread config

## Impact

- **Data model**: `ChatThread` interface gets `brainWash: boolean` (default `false`). `updateChatThread` accepts it. `threadConfigs` map stores it.
- **Platform server**: `handlers.ts` forwards `brainWash` in `request_state`. `message-router.ts` includes it in `session_ready` bootstrap.
- **Agent**: `onPermissionRequest` callback checks `threadConfigs.get(key)?.brainWash` before forwarding to browser. `threadConfigs` type extended with `brainWash?: boolean`.
- **Browser UI**: `chat-threads.js` renders checkbox in thread header. Toggle sends PATCH to existing `/sessions/:id/chat-threads/:threadId` endpoint.
- **No breaking changes**: All new fields default to `false`/omitted. Existing permission flow is unchanged when brain-wash is off.
