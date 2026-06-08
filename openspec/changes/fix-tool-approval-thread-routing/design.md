## Context

The tool approval flow currently broadcasts `permission_request` to all chat subscribers without thread context. When a session has multiple chat threads (each with its own ACP runtime), approval cards appear in whichever thread the user is viewing — not necessarily the thread that originated the request.

Current message flow:

```
Agent (thread-1 ACP) → platform: { type: "permission_request", chatThreadId: "thread-1", ... }
    → Platform message-router.ts:1024: drops chatThreadId, broadcasts to ALL subscribers
    → Frontend chat.js:1274: showPermissionCard(data) — no thread filter
    → Card appears in wrong thread
```

Other message types (`streaming_state`, `session_cleared`, etc.) already follow the correct pattern: the platform forwards `chatThreadId` and the frontend filters by `activeThreadId`.

The `browser-notification-on-prompt-completion` change adds notifications for `prompt_completed` when the tab is hidden, but does not address the "wrong thread in same tab" case for tool approvals.

## Goals / Non-Goals

**Goals:**

- Permission approval cards only render in the chat thread that originated the request
- When a non-active thread needs tool approval, the user receives a browser notification with a click-to-switch action
- Notification fires when the user is viewing a different thread (same tab or different tab)
- Follows existing thread-filtering and notification patterns already in the codebase

**Non-Goals:**

- Changing the agent-side permission request protocol (already sends `chatThreadId`)
- Persisting approval decisions across sessions
- Per-tool-kind allow-lists or policies
- Timeout-based auto-approve
- Notification for non-approval thread events (stays scoped to tool approval)

## Decisions

### D1: Forward `chatThreadId` through platform broadcast

**Decision:** In `handlePermissionRequest`, forward `chatThreadId` from the agent message to chat subscribers. This matches how other message types already work (streaming_state, error_response, etc.).

**Alternatives considered:**

- Store `chatThreadId` in `pendingPermissions` map and let the frontend query — unnecessary complexity; the data is already on the wire from the agent.

### D2: Frontend thread filter matches existing pattern

**Decision:** Add the same `activeThreadId` guard to `permission_request` and `permission_resolved` cases that other message types use:

```js
if (activeThreadId && data.chatThreadId && data.chatThreadId !== activeThreadId) {
  return; // or handle notification
}
```

**Alternatives considered:**

- Per-client subscriber tracking at the platform level (tracking which thread each WS client views) — would require WS metadata the platform doesn't currently track; over-engineering for this fix.

### D3: Notification triggers on wrong-thread, not just `document.hidden`

**Decision:** Fire the notification when `chatThreadId !== activeThreadId`, regardless of `document.hidden`. The existing `session-browser-notifications` spec only fires on `document.hidden`, but that doesn't help when the user is actively looking at the wrong thread in the same tab. Tool approvals are blocking — the agent stops — so the signal strength needs to match.

**Alternatives considered:**

- Only notify when `document.hidden` — misses the primary use case (user on wrong thread in same tab).
- Add a separate "thread attention" setting — adds UI complexity; tool approval is blocking so notification is always appropriate.

### D4: Notification click switches to the requesting thread

**Decision:** On notification click, call `window.focus()` and dispatch a custom event or call the existing thread-switch function with the `chatThreadId` from the notification data. This lets the user go directly to the thread that needs approval.

### D5: Notification respects `browserNotificationsEnabled` session flag

**Decision:** Only fire the notification if the session's `browserNotificationsEnabled` is `true`. This reuses the existing per-session toggle from `session-browser-notifications` rather than adding a new setting.

## Risks / Trade-offs

- **Notification permission not granted** → The browser Notification API requires user permission. If not granted, the notification silently fails. Mitigation: existing `requestPermission` call from the `browser-notification-on-prompt-completion` feature handles this.
- **Stale `activeThreadId` on reconnect** → If the frontend reconnects and hasn't received thread state yet, it might incorrectly filter. Mitigation: thread state is loaded on WebSocket connect; the window is small.
- **Multiple pending approvals across threads** → Each notification replaces the previous one (browser limitation). Mitigation: acceptable for now; a notification center is future work.