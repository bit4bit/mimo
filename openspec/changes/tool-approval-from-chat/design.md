## Context

The ACP protocol defines a `requestPermission` callback that fires whenever the agent wants to execute a tool. `AcpClient` currently hardcodes this to always return `approved`. The feature adds a round-trip: the callback suspends until the user responds via the chat UI.

Current flow:
```
claude-agent-acp → requestPermission → hardcoded "approved" → tool executes
```

Target flow:
```
claude-agent-acp → requestPermission (Promise) → agent sends "permission_request" to platform
    → platform broadcasts to chat clients → user clicks option
    → chat sends "permission_response" → platform routes to agent → Promise resolves
```

The agent WebSocket (`/ws/agent`) and chat WebSocket (`/ws/chat/{sessionId}`) already carry all the other message types needed. The platform already routes messages bidirectionally (e.g., `set_model` from chat → agent). The same pattern applies here.

## Goals / Non-Goals

**Goals:**
- Surface every tool approval request in the chat UI before the tool executes
- Work for all ACP providers (opencode, claude) — the callback is provider-agnostic
- Show all permission options returned by the ACP SDK (allow_once, allow_always, reject_once, reject_always)
- Auto-reject when all chat clients for the session disconnect
- Dismiss duplicate cards across multiple browser tabs once a decision is made

**Non-Goals:**
- Persisting approval decisions (e.g., "remember allow_always" across sessions)
- Server-side audit log of approval decisions
- Per-tool-kind allow-lists or policies
- Timeout-based auto-approve (we only auto-reject on disconnect)

## Decisions

### D1: Callback in AcpClientCallbacks, not a direct WebSocket reference

**Decision:** Add `onPermissionRequest` to `AcpClientCallbacks`. `MimoAgent` implements it and holds the pending Promise map. `AcpClient` stays decoupled from the platform transport.

**Alternatives considered:**
- Pass the platform WebSocket directly into `AcpClient` — couples transport to ACP logic, harder to test.
- Use an EventEmitter — adds indirection with no benefit here.

### D2: `requestId` generated in `AcpClient`, not `MimoAgent`

**Decision:** `AcpClient.requestPermission` generates a `crypto.randomUUID()` requestId before calling the callback. This ensures each pending request has a unique correlation key regardless of provider or session.

### D3: Pending requests map in `MimoAgent`, keyed by `requestId`

**Decision:** `MimoAgent` holds `pendingPermissions: Map<string, (r: RequestPermissionResponse) => void>`. When the platform sends `permission_response`, `MimoAgent` looks up and resolves the Promise.

**Alternatives considered:**
- Store in `AcpClient` — would require `AcpClient` to know about the platform transport.
- Store in platform — the platform doesn't own the ACP Promise, the agent does.

### D4: Auto-reject on last chat client disconnect

**Decision:** Platform tracks per-session pending permission requests (`pendingPermissions: Map<requestId, agentWs>`). In the WebSocket `close` handler, when a chat session's subscriber Set becomes empty, all pending requests for that session are rejected by sending `permission_response` with `outcome: "cancelled"` to the agent.

**Alternatives considered:**
- Timer-based auto-reject — harder to tune, adds background work.
- Never auto-reject — agent blocks indefinitely, session becomes unusable after tab close.

### D5: `permission_resolved` broadcast for multi-tab dismissal

**Decision:** After the platform routes a `permission_response` to the agent, it also broadcasts `permission_resolved` (with `requestId`) to all remaining chat clients for the session. Chat UI removes the card for that `requestId`.

### D6: Inline card in message stream, not a modal

**Decision:** Render the approval card as an inline element at the bottom of the chat message list, not a blocking modal. Users can scroll up to see context (what file is being edited) while the card is visible.

## Message Protocol

**Agent → Platform**
```json
{
  "type": "permission_request",
  "sessionId": "<sessionId>",
  "requestId": "<uuid>",
  "toolCall": { "title": "...", "kind": "edit", "locations": [...], "toolCallId": "..." },
  "options": [{ "optionId": "...", "kind": "allow_once", "name": "Allow Once" }, ...]
}
```

**Platform → Chat clients**
```json
{
  "type": "permission_request",
  "requestId": "<uuid>",
  "toolCall": { ... },
  "options": [ ... ]
}
```

**Chat → Platform**
```json
{
  "type": "permission_response",
  "requestId": "<uuid>",
  "optionId": "<optionId>"
}
```

**Platform → Agent**
```json
{
  "type": "permission_response",
  "requestId": "<uuid>",
  "outcome": { "outcome": "selected", "optionId": "<optionId>" }
}
```

**Platform → Chat clients** (broadcast after resolution)
```json
{
  "type": "permission_resolved",
  "requestId": "<uuid>"
}
```

**Platform → Agent** (on last client disconnect, for each pending request)
```json
{
  "type": "permission_response",
  "requestId": "<uuid>",
  "outcome": { "outcome": "cancelled" }
}
```

## Risks / Trade-offs

- **Agent blocks during pending request** → Any new user message sent while a tool is awaiting approval will queue behind the blocked `prompt()` call. This is acceptable — the agent is mid-turn. The UI should ideally show the agent as "waiting for approval" so the user doesn't send a second message.
- **Platform crash loses pending requests** → Agent blocks permanently. Mitigation: agent should have an independent watchdog timeout (future work).
- **requestId collisions** → UUID v4 collision probability is negligible.
- **`allow_always` semantics** → The ACP SDK may return this option, but the agent doesn't currently implement persistent allow-lists. Clicking "Allow Always" will resolve this request as selected, but future requests will still ask again. This is acceptable for the first iteration.

## Migration Plan

No data migration needed. The new message types are additive — old chat clients (before frontend update) will simply not render the card, and the agent will block until disconnect triggers the auto-reject.

Deploy order: agent first (sends new message type), then platform (routes it), then frontend (renders card).
