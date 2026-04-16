## Why

The current Notes buffer is session-scoped only. Users often want to capture context that spans multiple sessions within a project — architecture decisions, task backlogs, links, credentials hints — that should be visible regardless of which session is open. Session notes, by contrast, should remain session-specific: scratch space, immediate context, current task details.

Mixing both levels in the same textarea forces users to either duplicate cross-session content into every session or lose it when sessions end.

## What Changes

- **NotesBuffer layout**: Split into two stacked sections — "Project Notes" at top, "Session Notes" at bottom — each with its own labeled textarea, auto-save, and save-status indicator.
- **Project notes persistence**: Stored at `<mimoHome>/projects/{projectId}/notes.txt` (project-level, survives session deletion).
- **Session notes persistence**: Unchanged — stored at `<mimoHome>/projects/{projectId}/sessions/{sessionId}/notes.txt`.
- **FrameStateService**: Add `loadProjectNotes(projectId)` and `saveProjectNotes(projectId, content)` methods.
- **Session detail route**: Load and pass `projectNotesContent` to the page alongside `notesContent`.
- **Project notes API**: New `GET /projects/:id/notes` and `POST /projects/:id/notes` endpoints.
- **NotesBuffer props**: Add `projectId` and `projectNotesContent` props.

## Capabilities

### Modified Capabilities
- `notes-buffer`: Extend to render two independent note sections (project-level and session-level).
- `frame-state-service`: Extend with project-notes load/save methods.

### New Capabilities
- `project-notes`: Persistent, project-scoped freeform notes accessible from any session of that project.

## Impact

- `packages/mimo-platform/src/buffers/NotesBuffer.tsx`: Major — split into two sections; new props.
- `packages/mimo-platform/src/sessions/frame-state.ts`: Add `loadProjectNotes` / `saveProjectNotes`.
- `packages/mimo-platform/src/sessions/routes.tsx`: Pass `projectNotesContent` to `SessionDetailPage`.
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`: Accept and forward `projectNotesContent` and `projectId` to `NotesBuffer`.
- New routes under `/projects/:id/notes` (GET / POST).
- `openspec/specs/frame-buffers/spec.md`: Update R10 to describe the split-notes behavior.
