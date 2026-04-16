## 1. FrameStateService — Project Notes I/O

- [x] 1.1 Add `loadProjectNotes(projectId: string): string` to `FrameStateService` in `frame-state.ts`
- [x] 1.2 Add `saveProjectNotes(projectId: string, content: string): void` to `FrameStateService`

## 2. Project Notes API

- [x] 2.1 Add `GET /projects/:id/notes` endpoint to projects routes (auth, load via `frameStateService.loadProjectNotes`)
- [x] 2.2 Add `POST /projects/:id/notes` endpoint to projects routes (auth, save via `frameStateService.saveProjectNotes`)

## 3. Session Detail Route — Pass Project Notes

- [x] 3.1 In `GET /sessions/:id` handler (`routes.tsx`), load project notes via `frameStateService.loadProjectNotes(session.projectId)`
- [x] 3.2 Pass `projectNotesContent` and `projectId` props to `SessionDetailPage`

## 4. SessionDetailPage — Forward Props to NotesBuffer

- [x] 4.1 Add `projectId` and `projectNotesContent` props to `SessionDetailPage`
- [x] 4.2 Forward `projectId` and `projectNotesContent` to `NotesBuffer`

## 5. NotesBuffer — Split Layout

- [x] 5.1 Add `projectId` and `projectNotesContent` to `NotesBufferProps`
- [x] 5.2 Render "Project Notes" section (label + textarea + save status) at top
- [x] 5.3 Render section divider between project and session notes
- [x] 5.4 Render "Session Notes" section (label + existing textarea + save status) at bottom
- [x] 5.5 Add CSS for `.notes-section-label` and `.notes-divider`
- [x] 5.6 Create `notes.js` for debounced auto-save of both project and session notes

## 6. Layout and Scripts

- [x] 6.1 Add `/js/notes.js` script to Layout component for session pages
- [x] 6.2 Implement notes.js with auto-save (2s debounce) for both sections

## 7. Spec Update

- [x] 7.1 Update R10 in `openspec/specs/frame-buffers/spec.md` to describe the split-notes layout

## 8. Testing

- [x] 8.1 Write failing test: loading session detail page passes `projectNotesContent` to the buffer
- [x] 8.2 Write failing test: `GET /projects/:id/notes` returns project notes content
- [x] 8.3 Write failing test: `POST /projects/:id/notes` persists project notes independently of session notes
- [x] 8.4 Write failing test: deleting a session does not delete project notes
- [x] 8.5 Write failing test: NotesBuffer renders two labeled sections
- [x] 8.6 Tests ready to run (implementation complete)
