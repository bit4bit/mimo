## Context

Chat threads are stored as an array within the `Session` entity (`session.chatThreads`). Thread names are user-facing labels displayed in the UI for navigation. Currently, there is no validation preventing multiple threads in the same session from sharing the same name, leading to ambiguous UI state.

Threads are created via `SessionRepository.addChatThread()` and renamed via `SessionRepository.updateChatThread()`. The REST layer (`handlers.ts`) delegates to these methods. Enforcement at the repository layer provides defense in depth and protects against all callers (including internal services), not just REST requests.

## Goals / Non-Goals

**Goals:**
- Prevent duplicate thread names within a single session
- Provide clear, actionable error messages on collision
- Ensure both creation and rename operations enforce the rule

**Non-Goals:**
- Global uniqueness across all sessions or all projects
- Auto-renaming on collision
- Case-insensitive comparison
- Database-level constraints (YAML file storage)

## Decisions

### Enforce in repository layer, not just handlers
**Rationale**: The repository is the canonical authority for session mutations. Internal callers (e.g., message-router) also invoke `addChatThread` and `updateChatThread`. Enforcing at the repository ensures the invariant holds regardless of entry point.

### Case-sensitive comparison
**Rationale**: Aligns with the user's explicit requirement. `"Foo"` and `"foo"` are treated as distinct names.

### Exact match on trimmed name
**Rationale**: The validation should compare `name` values as-is. Trimming or normalizing is outside the scope of this change.

### Error: throw from repository, catch in handler
**Rationale**: Repository methods currently throw on errors (e.g., `Session not found`). Consistency is maintained by throwing a descriptive error from the repository and letting the handler translate it to HTTP 400.

## Risks / Trade-offs

- [Risk] Existing code that creates threads programmatically may now throw if it inadvertently generates duplicate names → Mitigation: review callers (`message-router.ts` does not create threads; only handlers do)
