## Context

The MIMO platform uses sessions to isolate work on projects. Each session has a `status` field currently supporting `active`, `paused`, and `closed`. When external changes occur in the upstream repository, users need a way to freeze all sessions to prevent editing stale state.

The freeze operation is a project-level action that affects all sessions belonging to that project. Once frozen, sessions remain viewable but cannot accept new edits or commits.

## Goals / Non-Goals

**Goals:**
- Provide a one-click "Freeze Project" action that marks all sessions as `frozen`
- Prevent chat message sending on frozen sessions
- Prevent commit operations on frozen sessions
- Display `frozen` status clearly in the sessions list

**Non-Goals:**
- Automatic freeze detection (this is manual user action)
- Unfreezing sessions (create new sessions instead)
- Visual badges or icons (just status text)
- Changes to agent-workspace file system
- Interruption of running agents

## Decisions

**1. New `frozen` status value**
- Extends existing status enum: `"active" | "paused" | "closed" | "frozen"`
- Frozen sessions are distinct from paused (paused can be resumed, frozen cannot)
- Simple enum addition avoids complex state machines

**2. Project-level freeze action**
- POST endpoint: `/projects/:id/freeze`
- Iterates all sessions for the project and updates status to `frozen`
- No atomic transaction needed (eventual consistency is acceptable)

**3. Minimal UI changes**
- Single "Freeze Project" button in Project Detail Actions section
- Status displays as plain text "frozen" in sessions list
- No special styling or badges requested

**4. Blocking at API level**
- Check `session.status === 'frozen'` before processing chat messages
- Check `session.status === 'frozen'` before processing commits
- Return appropriate error message indicating session is frozen

## Risks / Trade-offs

- **Risk**: Users may accidentally freeze projects
  - Mitigation: Add confirmation dialog (optional, can be skipped per user preference)
  
- **Risk**: Frozen sessions accumulate over time
  - Mitigation: Archive functionality already exists for cleanup

- **Trade-off**: No unfreeze operation means users must create new sessions
  - Rationale: Keeps implementation simple, frozen sessions serve as historical record
