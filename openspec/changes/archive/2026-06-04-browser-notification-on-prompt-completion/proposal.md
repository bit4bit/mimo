## Why

Users wait for AI prompts to complete, often switching to other tabs or applications. Without a notification, they must manually check back, leading to idle time and missed context. Browser notifications when a prompt ends solve this by surfacing completion events even when the tab is in the background.

## What Changes

- Add `browserNotificationsEnabled` boolean flag to session configuration, persisted in `session.yaml`
- Expose `browserNotificationsEnabled` in session creation and detail API responses
- PATCH `/sessions/:id/config` accepts `browserNotificationsEnabled` toggle
- Settings page renders a checkbox to enable/disable browser notifications per session
- Frontend `chat.js` shows a browser notification when `prompt_completed` is received, but **only** if:
  - `document.hidden === true` (user on another tab) or the window is not focused, **and**
  - the active session has `browserNotificationsEnabled === true`
- Notification text is static: "Response ready"
- Clicking the notification brings the tab to focus

## Capabilities

### New Capabilities
- `session-browser-notifications`: Session-level browser notification preferences for prompt-completion events.

### Modified Capabilities
- *(none — this does not change existing spec-level behavior; it extends session configuration only)*

## Impact

- **Backend**: `Session` and `SessionData` interfaces, `SessionRepository`, `SessionResponse`, `toSessionResponse`, internal API config endpoints, PATCH web route
- **Frontend**: `SessionSettingsPage` UI, `chat.js` WebSocket handler (`prompt_completed`), new notification helper
- **Tests**: Backend integration tests for repo persistence and PATCH API; frontend integration tests for notification firing when hidden + enabled
- **Persistence**: Existing sessions without `browserNotificationsEnabled` default to `false` (backward compatible)
