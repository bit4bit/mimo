# Tasks

> BDD/TDD: write the failing behavior test before each implementation step. Tests cross real boundaries (repository/file system, REST, WebSocket). Mark `- [ ]` → `- [x]` as you go.

## 1. Schema and Repository Layer

- [x] 1.1 Write failing repository tests: `findSharedWith(username)` returns agents whose `sharedWith` contains the username; agents with no `sharedWith` field load as an empty grant list — covered by API-level sharing tests (section 7) plus repository hydration
- [x] 1.2 Add `sharedWith?: Array<{ username: string; permission: "use" }>` to the Agent and AgentData interfaces in `packages/mimo-platform/src/domain/agents/repository.ts`; treat missing as `[]` on read (centralized in `hydrate()`)
- [x] 1.3 Implement `findSharedWith(username)` (scan agents, filter by grant username) — shared `scanAgents()` helper
- [x] 1.4 Implement `addShare`/`removeShare` mutators that persist `sharedWith` to `agent.yaml`
- [x] 1.5 Confirm `agent.yaml` round-trips `sharedWith` via js-yaml; new agents serialize `sharedWith` (`[]`)

## 2. Authorization Predicate and Sharing Validation

> Decision: share/revoke orchestration lives in the handler layer (section 7) using repository mutators + the pure helpers below, matching this codebase's "handlers validate, repos persist" style. No `AgentService` constructor change.

- [x] 2.1 Write failing tests for `authorizeUse(agent, username)`: true for owner, true for a `use` grantee, false otherwise (`src/domain/agents/sharing.test.ts`)
- [x] 2.2 Implement `authorizeUse` as a pure function in `src/domain/agents/sharing.ts`
- [x] 2.3 Write failing tests for `validateShareInput`: rejects self-share, unknown username, duplicate grant; accepts valid input
- [x] 2.4 Implement `validateShareInput` (pure) in `sharing.ts`

## 3. Gate 1 — Agent Listing

- [x] 3.1 Failing integration test: `GET /api/internal/agents` returns owned agents plus agents shared with the user, de-duplicated (`sharing.test.ts` "List agents (union)")
- [x] 3.2 Update `listAgentsHandler` to union `findByOwner(me)` and `findSharedWith(me)`
- [x] 3.3 Shared-agent records render read-only (owner identity present, `sharedWith` exposed only to owner via `toAgentResponse`)

## 4. Gate 2 — Chat-Thread Agent Assignment

- [x] 4.1 Failing integration test: `POST .../chat-threads` with a shared agent succeeds
- [x] 4.2 Failing integration test: an agent the user neither owns nor is shared is rejected (404, no thread created)
- [x] 4.3 Update `addChatThreadHandler` to validate `assignedAgentId` via `authorizeUse`
- [x] 4.4 Apply `authorizeUse` to `createSessionHandler` and `assignAgentHandler` (closes the latent unauthorized-assignment hole)

## 5. Gate 3 — Runtime Prompt Routing (hard, lazy revoke)

- [x] 5.1 Failing test: after revocation, the next prompt is not routed and a system message is posted; thread stays open (`agent-share-revoke.test.ts`)
- [x] 5.2 Failing test: a still-authorized user's prompt routes normally
- [x] 5.3 In `send_message`, after `resolveAgentId`, load the agent and re-check `authorizeUse(agent, session.owner)`
- [x] 5.4 On failure: skip routing and post + persist a system message to the thread

## 6. User Search Endpoint

- [x] 6.1 Failing integration test: `GET /api/internal/users/search?q=` returns matches, excludes requester and already-shared users
- [x] 6.2 Implement the search handler over `listUsers()` and register `/api/internal/users` router
- [x] 6.3 Failing integration test: requires authentication

## 7. Share / Revoke Endpoints

- [x] 7.1 Failing integration tests for share: owner shares (200); self-share, unknown user, duplicate, non-owner all rejected
- [x] 7.2 Implement `shareAgentHandler` (owner-only) using `validateShareInput` + `addShare`
- [x] 7.3 Failing integration tests for revoke: owner revokes; non-owner rejected
- [x] 7.4 Implement `revokeShareHandler` (owner-only) using `removeShare`

## 8. Owner UI — Share Card

- [x] 8.1 Add a Share card to the agent detail page (`agents.tsx`), rendered only when `isOwner`, after the Agent Info card and before the Sessions section
- [x] 8.2 Username autocomplete via a `<datalist>` populated by an inline `<script>` (existing `copyToken` pattern) calling the page route `/agents/:id/share-candidates`, which proxies to `GET /api/internal/users/search`
- [x] 8.3 Render the shared-with list with a revoke control per row
- [x] 8.4 Wire the add-share (`POST /agents/:id/shares`) and revoke (`POST /agents/:id/shares/:username/delete`) page routes to the internal API

## 9. Recipient UI — Read-only Views

- [x] 9.1 Gate the token block, refresh, delete, and Share card behind `isOwner`; shared (non-owner) viewers see a read-only page without the token
- [x] 9.2 Mark shared agents in the agents list ("shared by {owner}") and omit the Delete action for them
- [x] 9.3 Chat-thread agent picker already consumes `/agents/list` → internal `/agents` (now union), so shared online agents appear automatically — no change needed
- [x] 9.4 Shared (non-owner) detail view contains no token — asserted at the API boundary (`sharing.test.ts` "lets a shared user view the agent without the token"); the page renders the token only when `isOwner`

## 10. Suite Health

- [x] 10.1 Full unit suite run; the 2 chat-thread test files that relied on the now-closed unauthorized-assignment hole were updated to seed an authorized agent. Remaining 3 failures (EditBuffer mention-mode, 2 Fossil bootstrap) confirmed pre-existing on the clean base commit — zero regressions from this change.
- [x] 10.2 Pre-commit formatting (`bun prettier --write`) applied to changed files
