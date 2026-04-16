## Context

The Notes buffer currently renders a single `<textarea>` backed by `GET/POST /sessions/:id/notes`, which stores content in `<sessionDir>/notes.txt`. The `FrameStateService` owns the load/save logic. `SessionDetailPage` passes `notesContent` and `sessionId` to `NotesBuffer`.

Project directories already exist at `<mimoHome>/projects/{projectId}/` (containing `project.yaml` and a `sessions/` subdirectory). A `notes.txt` at the project root requires no schema change.

## Goals / Non-Goals

**Goals:**
- Show project notes (top) and session notes (bottom) in one Notes buffer.
- Each section auto-saves independently.
- Project notes persist across session deletion.
- Minimal changes to existing persistence path for session notes.

**Non-Goals:**
- Rich text / markdown rendering.
- Shared/collaborative editing (single-user system).
- Per-section height resizing by users.
- Migration/import of existing session notes into project notes.

## Decisions

### Decision: Two stacked textareas in a single buffer component
**Rationale**: The Notes buffer is already a right-frame buffer. Splitting into two stacked sections (flex column, each `flex: 1`) uses the available vertical space symmetrically without needing a new buffer registration or frame restructuring.

**Alternatives considered**:
- Two separate buffers ("Project Notes" / "Session Notes") — rejected: wastes tab space; forces user to switch to see both.
- A toggle/tab inside the buffer — rejected: hides one section; defeats the goal of simultaneous visibility.

### Decision: Project notes stored at `<projectDir>/notes.txt`
**Rationale**: Mirrors the existing `<sessionDir>/notes.txt` pattern. No new infrastructure needed. Deleted when the project is deleted (consistent with session notes lifecycle).

**Path**: `<mimoHome>/projects/{projectId}/notes.txt`

### Decision: `FrameStateService` owns project notes I/O
**Rationale**: It already manages session notes and knows the `mimoHome` paths via injected `MimoPaths`. Adding `loadProjectNotes(projectId)` / `saveProjectNotes(projectId, content)` keeps all filesystem note operations in one place.

### Decision: Separate API endpoints for project notes
**Rationale**: Session notes endpoints (`/sessions/:id/notes`) are session-scoped. Project notes are project-scoped, so they belong under `/projects/:id/notes`. This keeps REST resource ownership clean and avoids mixing session auth checks with project auth checks.

**New endpoints:**
- `GET /projects/:id/notes` → `{ content: string }`
- `POST /projects/:id/notes` ← `{ content: string }` → `{ success: true }`

### Decision: `SessionDetailPage` loads project notes server-side at render time
**Rationale**: Consistent with how `notesContent` (session notes) is loaded today — passed as `initialContent` prop so the page renders correctly on first load without a client-side fetch. The project notes follow the same pattern via a new `projectNotesContent` prop.

### Decision: Each textarea has its own debounced auto-save (2 s inactivity)
**Rationale**: Project notes and session notes are independent resources. A change to one should not trigger a save of the other. The existing debounce pattern in `notes.js` is replicated for the project textarea.

## Risks / Trade-offs

**[Risk]** Project notes file grows without bound.
→ **Mitigation**: Plain text; acceptable for notes use case. No size limit needed now.

**[Risk]** Concurrent edits from two browser tabs overwrite each other.
→ **Mitigation**: Existing risk for session notes too; no change. Single-user system, acceptable.

**[Trade-off]** Vertical space split 50/50 between project and session notes.
Two equal sections may feel cramped on short screens. A CSS `min-height` of 80px per section prevents collapse.

## Migration Plan

No data migration required. Existing `notes.txt` files in session directories are untouched. Project-level `notes.txt` files are created on first save.

## Open Questions

1. Should the project notes section be collapsible (user-resizable split)?
2. Should project notes be shown read-only when the user has no write access to the project (future multi-user scenario)?
