# Specification: Notes Buffer — Project + Session Split

## Requirements

### R1: Notes Buffer Layout
The Notes buffer SHALL render two stacked sections inside a single flex-column container:
- **Top section**: "Project Notes" — occupies `flex: 1` of available height.
- **Bottom section**: "Session Notes" — occupies `flex: 1` of available height.
- A visible divider with section labels SHALL separate the two sections.
- Each section SHALL have a minimum height of 80px to prevent collapse on short viewports.

### R2: Project Notes Content
The "Project Notes" section SHALL:
- Display a labeled header: "Project Notes".
- Provide a multi-line `<textarea>` for freeform text input.
- Auto-save content after 2 seconds of inactivity via `POST /projects/:projectId/notes`.
- Load persisted content from `projectNotesContent` prop on initialization.
- Show a save-status indicator ("Saved") after each successful save.

### R3: Session Notes Content
The "Session Notes" section SHALL:
- Display a labeled header: "Session Notes".
- Provide a multi-line `<textarea>` for freeform text input.
- Auto-save content after 2 seconds of inactivity via `POST /sessions/:sessionId/notes` (unchanged behavior).
- Load persisted content from `initialContent` prop on initialization.
- Show a save-status indicator ("Saved") after each successful save.

### R4: NotesBuffer Props
The `NotesBuffer` component SHALL accept the following props:
```typescript
interface NotesBufferProps extends BufferProps {
  sessionId: string;
  projectId: string;
  initialContent?: string;       // session notes
  projectNotesContent?: string;  // project notes
}
```

### R5: Project Notes Storage
Project notes SHALL be stored as plain text:
- **Path**: `<mimoHome>/projects/{projectId}/notes.txt`
- Created on first save; returns empty string if not yet created.
- Deleted when the project is deleted.
- Survives session deletion.

### R6: Session Notes Storage (unchanged)
Session notes SHALL continue to be stored at:
- **Path**: `<mimoHome>/projects/{projectId}/sessions/{sessionId}/notes.txt`
- Created on first save; deleted when the session is deleted.

### R7: FrameStateService — Project Notes Methods
`FrameStateService` SHALL expose:
```typescript
loadProjectNotes(projectId: string): string
saveProjectNotes(projectId: string, content: string): void
```
- `loadProjectNotes` returns `""` if the file does not exist.
- `saveProjectNotes` creates the file (and parent directory) if needed.

### R8: Project Notes API
New endpoints:

#### GET /projects/:id/notes
- Requires authenticated user who owns the project.
- Returns: `{ content: string }`
- Returns `""` content if no notes file exists yet.

#### POST /projects/:id/notes
- Requires authenticated user who owns the project.
- Accepts: `{ content: string }`
- Returns: `{ success: true }`

### R9: Session Detail Page — Project Notes Prop
When rendering `SessionDetailPage`, the route handler SHALL:
- Load project notes via `frameStateService.loadProjectNotes(session.projectId)`.
- Pass the result as `projectNotesContent` to `SessionDetailPage`.
- Pass `session.projectId` as `projectId` to `SessionDetailPage`.

`SessionDetailPage` SHALL forward `projectId` and `projectNotesContent` to `NotesBuffer`.

### R10: Spec Update
`openspec/specs/frame-buffers/spec.md` R10 SHALL be updated to describe the split-notes layout:
> The Notes buffer SHALL render two independent note sections: Project Notes (top, project-scoped) and Session Notes (bottom, session-scoped), each with auto-save and a save-status indicator.

## API Specification

### GET /projects/:id/notes
**Response:**
```json
{ "content": "..." }
```

### POST /projects/:id/notes
**Request:**
```json
{ "content": "..." }
```
**Response:** `{ "success": true }`

## UI Specification

### Section Divider
```html
<div class="notes-section-label">Project Notes</div>
<textarea class="notes-input" id="project-notes-input">...</textarea>
<div class="notes-save-status" id="project-notes-save-status">Saved</div>

<div class="notes-divider"></div>

<div class="notes-section-label">Session Notes</div>
<textarea class="notes-input" id="notes-input">...</textarea>
<div class="notes-save-status" id="notes-save-status">Saved</div>
```

### Styling
```css
.notes-section-label {
  font-size: 11px;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 0.05em;
  padding: 4px 0 2px;
}
.notes-divider {
  height: 1px;
  background: #444;
  margin: 6px 0;
}
```

## Data Storage

### Project Notes
- **Path**: `<mimoHome>/projects/{projectId}/notes.txt`
- **Format**: Plain text
- **Created**: On first `saveProjectNotes` call
- **Deleted**: When project is deleted

### Session Notes (unchanged)
- **Path**: `<mimoHome>/projects/{projectId}/sessions/{sessionId}/notes.txt`
- **Format**: Plain text
