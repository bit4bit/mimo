## Context

Agents are owned by exactly one user. The `Agent` record (stored as `~/.mimo/agents/{id}/agent.yaml` via `js-yaml`) carries `id`, `name`, `owner` (a username), `token` (a server-side JWT), `sessionIds`, `status`, `provider`, and cached `capabilities`. Users are identified solely by `username` (no email, no numeric id); credentials live at `~/.mimo/users/{username}/credentials.yaml`, and the repository already exposes `listUsers()`.

Every agent REST route enforces ownership with "owner-only, else 404" (`if (agent.owner !== user.username) return 404`). The chat-thread flow assigns an agent to a thread via `assignedAgentId`, and at prompt time the WebSocket handler resolves that id (`resolveAgentId`) and routes work to the agent connection (`getAgentConnection`) — **without re-checking agent ownership**. The agent's JWT is used only on the agent's own WebSocket connection; a sharee's browser never needs it.

This change lets an owner grant other users **use** access to an agent, scoped precisely to "can pick this agent for a chat thread and run prompts through it". Because the runtime does not re-check ownership today, the meaningful authorization boundary is upstream: which agents a user may list and assign, plus a new lazy runtime check so revocation actually takes effect.

The change affects four layers:

1. **Data**: Agent gains `sharedWith` grants in `agent.yaml`.
2. **Domain**: a single `authorizeUse` predicate plus share/revoke operations and a `findSharedWith` query.
3. **API**: list/assignment/runtime gates use `authorizeUse`; new user-search and share/revoke endpoints.
4. **UI**: owner Share card; read-only recipient view in the agents list, detail page, and thread picker.

## Goals / Non-Goals

**Goals:**

- An owner can share an agent with another existing user and revoke that access.
- A recipient can use a shared agent in their chat threads exactly as they would their own.
- A recipient never sees the agent token and cannot rename, delete, refresh, or re-share it.
- Revocation is enforced: a revoked user cannot start a new prompt on the agent.
- One authorization predicate is the single source of truth, enforced at all three gates.
- The grant shape is extensible for future per-grant properties.

**Non-Goals:**

- Permission levels beyond `"use"` (the enum has one value now; the shape is ready for more).
- Re-sharing / transitive sharing (a recipient cannot share onward).
- Group/team sharing (grants are per-username).
- Proactive, in-flight cancellation of a running prompt on revoke (enforcement is lazy, on next prompt).
- Notifying the recipient when an agent is shared with or revoked from them.
- Sharing ownership, the token, or any owner-only capability.

## Decisions

### Decision: Grant shape — list of objects, not list of usernames

**Options Considered:**

1. `sharedWith: string[]` (usernames) — minimal, but adding any per-grant property later is a breaking migration of every `agent.yaml`.
2. `sharedWith: Array<{ username, permission }>` — slightly more verbose now, extensible later.
3. `sharedWith: Record<username, grant>` — map form; awkward to serialize as a list in YAML and to render.

**Chosen: Option 2.**

Rationale: the user explicitly wants to introduce additional grant properties later (e.g. expiry, scope). An object grant lets us add fields without touching existing data. `permission` is a string enum with a single value `"use"` today.

### Decision: One predicate, three gates

**Options Considered:**

1. Inline ownership/shared checks at each call site — duplicates the rule, risks drift.
2. A single `authorizeUse(agent, username)` reused everywhere.

**Chosen: Option 2.**

`authorizeUse(agent, username) = agent.owner === username || agent.sharedWith.some(g => g.username === username && g.permission === "use")`. Pure function, injected/imported, no I/O. Used by: the list query (as a filter alongside `findByOwner`), the thread-assignment validation, and the runtime `send_message` check. This keeps the authorization rule in one place (DRY) and makes the three gates provably consistent.

### Decision: Listing = `findByOwner` ∪ `findSharedWith`

The list handler currently calls `findByOwner(me)`. We add `findSharedWith(me)` (scans agents whose `sharedWith` includes the username) and union the two, de-duplicating by id. Both are file scans, consistent with the existing repository style; no index is introduced. The owner relationship is preserved on each record so the UI can render shared agents read-only.

### Decision: Hard revoke, enforced lazily at the next prompt

**Options Considered:**

1. **Soft revoke** — drop from the picker only; existing threads keep working until reassigned. Simple but leaky; a revoked user keeps running the agent indefinitely.
2. **Hard + proactive** — on revoke, find every thread using the agent across all users, push a cancel to live connections, and stop in-flight prompts. Strong, but requires a reverse agent→threads index, cross-user server push, and in-flight prompt-state tracking — significant new realtime machinery.
3. **Hard + lazy** — revoke just edits `sharedWith`; the runtime `send_message` gate re-checks `authorizeUse` on each prompt. A revoked user's **next** prompt is declined and a system message is posted to that thread.

**Chosen: Option 3.**

Rationale: it delivers real enforcement (a revoked user cannot run another prompt) with a small, contained change in the existing `send_message` path and no new realtime infrastructure. The trade-off — a prompt already in flight at the instant of revocation completes — is acceptable per the agreed product behavior. The user is informed via a system message rather than a closed/cleared thread.

### Decision: Recipient view is read-only by hiding owner-only affordances

The agent detail page is one server-rendered Hono JSX function. Rather than build a separate page, we gate owner-only sections (token block, refresh, delete, and the new Share card) behind `agent.owner === user.username`. A non-owner viewer sees identity/status/capabilities/sessions only. The agents list marks shared rows (e.g. "shared by {owner}") and omits owner-only actions. This reuses the existing page (fewest elements) and keeps a single rendering path.

### Decision: User search excludes self and existing grantees

`GET /api/internal/users/search?q=` filters `listUsers()` by prefix/substring on username, removes the requesting user, and (when an agent id is supplied) removes users already in that agent's `sharedWith`. This makes self-share and duplicate-share structurally hard from the UI; the service still validates them server-side (defense in depth).

## Risks / Trade-offs

**[Risk] In-flight prompt completes after revocation (lazy enforcement).**
→ Accepted by design. Enforcement applies from the next prompt. Documented in the spec scenarios.

**[Risk] Latent assignment hole — `assignedAgentId` not currently authorized.**
→ This change adds the missing `authorizeUse` check at thread creation/session assignment, closing the gap rather than widening it. Covered by a behavior test asserting an unauthorized `assignedAgentId` is rejected.

**[Risk] Token leakage to a sharee.**
→ The token block is owner-only in the UI, and the token is never sent to a sharee's browser (it is used only on the agent's own WS connection). A test asserts the shared (non-owner) detail view contains no token.

**[Risk] Listing cost grows with a full agent scan for `findSharedWith`.**
→ Consistent with the existing `findByOwner` scan; acceptable at current scale. No new index introduced; revisit only if listing becomes hot.

**[Risk] Revoking a user mid-session is confusing if nothing visible happens.**
→ The system message on the next declined prompt makes the state change explicit to the recipient.

## Migration Plan

1. **Schema**: add `sharedWith?: Array<{ username: string; permission: "use" }>` to the Agent/AgentData interfaces. Reads treat a missing field as `[]`.
2. **No backfill script**: the field is additive and optional; existing `agent.yaml` files load with an empty grant list. New writes include `sharedWith` (possibly `[]`).
3. **Predicate + repo**: add `authorizeUse`, `findSharedWith`, and add/remove-grant mutators with behavior tests first.
4. **Gates**: update list, thread-assignment, and `send_message` to use the predicate (tests first per gate).
5. **Endpoints + UI**: add user-search and share/revoke endpoints, then the owner Share card and read-only recipient rendering.

Rollback: the field is additive and never removed; rolling back code leaves harmless `sharedWith` data in YAML that older code ignores.
