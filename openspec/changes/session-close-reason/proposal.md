## Why

When closing a session, users currently just confirm a prompt without capturing why the session ended. Teams need visibility into why sessions were closed (completed, abandoned, superseded) for project history and audit purposes. Currently, session lists only show "closed" status with no context.

## What Changes

- **New page**: `GET /projects/:projectId/sessions/:id/close` renders a form asking for close reason before closing
- **New field**: `closeReason?: string` added to session data model
- **Updated route**: `POST /sessions/:id/close` accepts `closeReason` body parameter and persists it
- **Updated UI**: Session list pages display close reason for closed sessions (e.g., tooltip or inline text)
- **Navigation safety**: Close and Cancel buttons return to the originating session detail page
- **Breaking**: None. Existing closed sessions will have `closeReason: undefined` (backward compatible)

## Capabilities

### New Capabilities
- `session-close-reason`: Capturing and displaying why a session was closed

### Modified Capabilities
- `session-management`: Close operation now requires reason input and persists it. Session list display includes close reason for closed sessions.

## Impact

- `packages/mimo-platform/src/sessions/repository.ts` - Session interface and data model
- `packages/mimo-platform/src/sessions/routes.tsx` - New GET close page route, updated POST close handler
- `packages/mimo-platform/src/components/SessionDetailPage.tsx` - Close button links to close page instead of direct POST
- `packages/mimo-platform/src/components/ProjectsSessionsPage.tsx` - Display close reason in session list for closed sessions
- `packages/mimo-platform/src/components/SessionList.tsx` - Potentially display close reason in list view
