## Context

The MIMO platform already has a real-time prompt lifecycle streaming via WebSocket. The backend broadcasts `prompt_completed` when a response finishes. The frontend in `public/js/chat.js` handles this event and finalizes the stream. There is currently no way to notify users when they are not actively viewing the tab.

Adding browser notifications requires:
1. A per-session opt-in toggle (privacy-respecting)
2. Persistence of that toggle in the session configuration
3. Frontend logic to request notification permission and fire the notification

## Goals / Non-Goals

**Goals:**
- Allow users to opt in per session to receive browser notifications when prompts complete
- Persist the opt-in in the session configuration (`session.yaml`)
- Show a Web Notification with title "Response ready" only when the tab is hidden/unfocused
- Clicking the notification focuses the browser tab
- Work across modern desktop browsers (Chrome, Firefox, Edge, Safari)

**Non-Goals:**
- Push notifications or service workers (not needed for same-browser tab notifications)
- Sound alerts or custom icons (keep it simple)
- Notifications when the user has the tab focused (no noise; notification only when they aren't looking)
- Per-thread notification preferences (session-scoped is sufficient)
- Mobile browser support (desktop-first)

## Decisions

### 1. Session-scoped preference over global preference
**Decision:** Notifications are enabled/disabled per session.
**Rationale:** Users may want notifications for urgent production sessions but not for routine dev work. Session-level config is more granular and already maps cleanly to the existing `SessionRepository` and `UpdateSessionConfigInput` abstractions. Global preference would require a separate settings mechanism.

### 2. Default off (backward compatible)
**Decision:** New sessions default `browserNotificationsEnabled` to `false`; existing sessions without the field also default to `false`.
**Rationale:** Browser notifications are intrusive. Default-off respects user consent and ensures no breaking change to existing behavior. The frontend will request `Notification.permission` lazily when the user first toggles the setting on.

### 3. Lazy permission request via frontend toggle
**Decision:** The frontend requests `Notification.requestPermission()` when the user clicks the settings checkbox to enable notifications, not during page load.
**Rationale:** Requesting permission on page load is a poor UX pattern and often blocked by browsers. Associating the request with a deliberate user action maximizes acceptance rates.

### 4. No backend notification API needed
**Decision:** Notifications are handled entirely in the frontend's `chat.js` WebSocket handler.
**Rationale:** The `prompt_completed` event already reaches the frontend over the existing WebSocket. There is no need for server-side push (WebPush, SSE, etc.). The backend only needs to store the preference and return it in session detail responses.

### 5. Static "Response ready" text
**Decision:** The notification body is the static string "Response ready".
**Rationale:** Including message content in notifications leaks potentially sensitive data to the OS notification center. A static message is safer, simpler, and sufficient to get the user back to the tab.

## Risks / Trade-offs

- **Browser blocks permission** → Mitigation: permission request is tied to user action (clicking checkbox)
- **User denies permission** → Mitigation: frontend remembers "denied" state and shows a helpful message in the settings UI explaining how to re-enable via browser settings
- **Tab is visible; no notification fires** → This is intentional behavior, not a bug. The goal is to notify only when the user is away.

## Migration Plan

No migration needed. This is a purely additive, backward-compatible change:
- Existing sessions without `browserNotificationsEnabled` default to `false`
- Existing frontend code is unaffected when `browserNotificationsEnabled` is `false`

## Open Questions

None.
