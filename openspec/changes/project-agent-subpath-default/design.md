## Context

Sessions already support `agentSubpath` — a relative path within the cloned checkout that becomes the agent's working directory. It is stored on `Session`, passed through `CreateSessionInput`, and consumed at ACP spawn time in `mimo-agent`. Currently this value must be supplied manually each time a session is created; the project has no equivalent field.

`Project` is persisted as YAML in `~/.mimo/projects/<id>/project.yaml`. Its data model (`ProjectData`) is the authoritative serialization format.

## Goals / Non-Goals

**Goals:**
- Add `agentSubpath?: string` to the `Project` model, persisted at creation time.
- Resolve effective `agentSubpath` at session creation: non-empty form value → project default → undefined (repo root).
- Pre-fill the session creation form with the project's `agentSubpath`.
- Show `agentSubpath` field on `ProjectCreatePage`.

**Non-Goals:**
- Editing `agentSubpath` after project creation.
- Propagating a project `agentSubpath` change to existing sessions.
- Any agent-side changes (agent already handles `agentSubpath` correctly).

## Decisions

### D1 — Eager resolution at session creation, not lazy at spawn time

The effective `agentSubpath` is resolved in `sessions/routes.tsx` at creation time and stored on the session. This keeps sessions self-contained (same pattern as `sourceBranch`/`newBranch`).

Alternative: resolve lazily when the agent bootstraps by fetching the project. Rejected — adds coupling from the agent to the platform for a value that does not change, and makes session behavior depend on the project state at spawn time rather than creation time.

### D2 — Empty string from the form treated as "not provided"

In the session creation route:
```
const effectiveSubpath = (agentSubpath?.trim() || undefined) ?? project.agentSubpath ?? undefined
```
An empty or whitespace-only form submission falls through to the project default, then to `undefined` (repo root). This prevents a user accidentally clearing an inherited default by submitting a blank field.

### D3 — Field not exposed in `ProjectRepository.update()`

`agentSubpath` is write-once: set at creation, never editable via `update()`. This avoids the question of how to handle existing sessions whose `agentSubpath` was inherited from the project. Consistent with how `repoType` and `repoUrl` are not freely mutable.

### D4 — Same field name on both Project and Session (`agentSubpath`)

Using the same name avoids a translation layer and makes the inheritance intent obvious in the session creation route.

## Risks / Trade-offs

- **Stale inherited value** — If a user wants to change the default for future sessions, they cannot without recreating the project. Acceptable given the non-goal of editability; users can always override per-session.
- **No validation of path existence** — `agentSubpath` is not validated against the repo at project creation time (the repo is cloned only when a session is created). Behaviour is consistent with the existing session-level field.

## Migration Plan

No migration needed. Existing projects simply have no `agentSubpath` field — the `??` fallback in session creation handles this transparently.
