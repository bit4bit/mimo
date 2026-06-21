## Why

Agents are single-owner today. The `owner` field on an agent is a single username, and every agent route enforces "owner-only, else 404". This means a user who has set up and connected an agent (with a provider, a token, live capabilities) cannot let a teammate use it. The teammate must create and run their own agent even when an existing one would serve them.

Users want to share an agent so a recipient can **use it in their chat threads** — pick it as the assigned agent for a thread and run prompts through it — without ever owning or controlling it, and without ever seeing its token.

## What Changes

- Add a `sharedWith` field to the Agent schema: a list of grant objects `{ username, permission }`. Only the `"use"` permission exists now; the object shape is deliberate so additional per-grant properties can be added later without a breaking migration.
- Introduce a single authorization predicate `authorize(agent, user, "use")` = user is the owner **OR** user appears in `sharedWith` with that permission. Enforce it at three existing gates that today all call `findByOwner(user.username)`:
  1. **Agent listing** (`GET /api/internal/agents`): returns owned agents **plus** agents shared with the user.
  2. **Chat-thread agent assignment** (`POST /api/internal/sessions/:id/chat-threads`): `assignedAgentId` must pass `authorize`. This also closes a latent gap — today the handler only checks the field is present, not that the user may use that agent.
  3. **Runtime prompt routing** (`send_message` in the chat WebSocket handler): re-check `authorize` on each prompt. Revocation is **hard but lazy** — when a previously-shared user sends their next prompt on a thread bound to a now-revoked agent, the prompt is declined and a **system message** is posted to that thread ("You no longer have access to this agent"). The thread is not closed; nothing is cancelled in-flight; nothing is pushed proactively.
- Add `GET /api/internal/users/search?q=` returning matching usernames, excluding the requesting user and users the agent is already shared with — backing the owner's autocomplete.
- **Owner UI**: a new "Share" card on the agent detail page (owner only) with a username autocomplete input to add a grant, a list of users the agent is shared with, and a revoke control per row.
- **Recipient UI**: shared agents appear in the recipient's agents list and in the chat-thread agent picker, rendered **read-only** — no token, no rename/delete/refresh, no Share card.

## Capabilities

### New Capabilities

- `agent-sharing`: An agent owner can grant other users permission to use the agent, view and revoke those grants, and the system enforces use-permission across listing, thread assignment, and runtime prompt routing.

### Modified Capabilities

- `agent-management`: The agent list now includes agents shared with the user, and the agent detail view renders read-only for users who are not the owner (no token, no owner-only actions).

## Impact

- **Agent schema**: Add `sharedWith: Array<{ username: string; permission: "use" }>` (defaults to empty) to the Agent interface and `agent.yaml` serialization.
- **AgentRepository**: New `findSharedWith(username)` that scans agents whose `sharedWith` contains the username; new mutators to add/remove a grant. `findByOwner` unchanged.
- **AgentService**: New `shareAgent(agentId, owner, username)` and `revokeShare(agentId, owner, username)` (owner-only); new `authorizeUse(agent, username)` predicate reused by all gates; validation (reject self-share, reject unknown username, reject duplicate grant).
- **REST handlers**:
  - `listAgentsHandler`: union of owned + shared.
  - `getAgentHandler` / agent detail: allow shared users (read-only); owner-only sections gated by ownership.
  - `addChatThreadHandler` (and session-create agent assignment): validate `assignedAgentId` via `authorizeUse`.
  - New `users/search` handler and route.
  - New share / revoke handlers and routes (owner-only).
- **WebSocket** (`send_message`): after `resolveAgentId`, look up the agent and re-check `authorizeUse`; on failure, decline and emit a system message to the thread.
- **UI: agent detail page**: new Share card (owner only); hide token/delete/refresh and Share card for shared (non-owner) viewers; client `<script>` for autocomplete following the existing inline-script pattern.
- **UI: agents list**: show shared agents, marked as shared / read-only.
- **Tests**: behavior-first integration tests for each gate, sharing/revoking, lazy revoke system message, user search, and read-only recipient view.
- **Migration**: additive only — agents without `sharedWith` are treated as an empty list; no backfill script required.
- **Auth**: no change to the auth model; the agent JWT token remains server-side only and is never exposed to sharees.
