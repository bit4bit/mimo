## Context

The platform currently allows thread creation without an `assignedAgentId`. This is represented in both UI (`Agent (optional)` with `None`) and backend (`assignedAgentId` coerced to `null` when absent). That permissive behavior creates threads that are structurally valid but operationally incomplete for agent-driven features.

## Goals / Non-Goals

**Goals:**
- Enforce agent assignment at thread creation in both UI and API layers.
- Fail fast with clear validation when an agent is not selected.
- Keep thread data model backward compatible for existing persisted threads.

**Non-Goals:**
- Migrating existing threads with `assignedAgentId: null`.
- Changing thread update semantics (`PATCH`) or delete behavior.
- Introducing new agent discovery APIs.

## Decisions

- Validate `assignedAgentId` as required in `POST /sessions/:id/chat-threads`.
  - Rationale: server-side validation is authoritative and protects non-UI clients.
  - Alternative considered: UI-only enforcement. Rejected because API clients could still create invalid threads.
- Remove optional UI affordance in create-thread dialog.
  - Rationale: align user flow with API contract and prevent avoidable validation errors.
  - Alternative considered: leave "None" and rely on API errors. Rejected because it creates friction and redundant failed requests.
- Preserve nullable thread field in storage.
  - Rationale: avoids migration risk and keeps compatibility with older records.
  - Alternative considered: immediate schema migration to non-null field. Rejected as unnecessary for this behavioral change.

## Risks / Trade-offs

- [Risk] Users cannot create a thread when no online agents are available in the selector. -> Mitigation: show explicit validation feedback and keep behavior deterministic.
- [Trade-off] Existing API clients that omit `assignedAgentId` will receive 400 responses. -> Mitigation: update tests/docs and rely on clear error messaging.
