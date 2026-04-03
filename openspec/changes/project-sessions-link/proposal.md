## Why

Users cannot view or create sessions from the project detail page. When viewing a project, users see project metadata but have no visibility into existing sessions or a way to start new development sessions. The project-management spec states that selecting a project should "display project's sessions," but this requirement is not implemented.

## What Changes

- **NEW**: Sessions section on ProjectDetailPage showing list of existing sessions
- **NEW**: "New Session" button linking to `/projects/:id/sessions/new`
- **NEW**: Session list with session name, status, and link to session detail
- **MODIFIED**: ProjectDetailPage to include sessions UI alongside project metadata

## Capabilities

### New Capabilities

- `project-session-overview`: Users can view all sessions for a project and create new sessions directly from the project detail page

### Modified Capabilities

- `project-management`: Add requirement for displaying sessions on project detail page (already partially specified but not implemented)

## Impact

**Files Modified:**
- `src/components/ProjectDetailPage.tsx` - Add session list section and "New Session" button

**Dependencies:**
- Existing session routes (`/projects/:projectId/sessions`)
- Existing session repository (`listByProject`)
- Existing ProjectDetailPage component

**No Breaking Changes:** This is purely additive - adds UI elements to an existing page.