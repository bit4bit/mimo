# Tasks: project-sessions-link

## 1. Backend - Route Update

- [x] 1.1 Update `/projects/:id` route to fetch sessions using `sessionRepository.listByProject(projectId)`
- [x] 1.2 Pass sessions array to ProjectDetailPage component
- [x] 1.3 Handle case where session list is empty

## 2. Frontend - Component Update

- [x] 2.1 Update ProjectDetailPage props to accept sessions array
- [x] 2.2 Add Sessions section heading between project details and actions
- [x] 2.3 Add session list with session name and creation date
- [x] 2.4 Make session names clickable links to `/projects/:projectId/sessions/:sessionId`
- [x] 2.5 Add "No sessions yet. Create one to start development." empty state message
- [x] 2.6 Add "New Session" button linking to `/projects/:projectId/sessions/new`
- [x] 2.7 Style "New Session" button as primary action (filled background)

## 3. Testing

- [x] 3.1 Test project detail page shows sessions when project has sessions
- [x] 3.2 Test project detail page shows empty state when project has no sessions
- [x] 3.3 Test "New Session" button navigates to session creation form
- [x] 3.4 Test clicking session name navigates to session detail
- [x] 3.5 Test sessions are ordered by creation date (most recent first)
- [x] 3.6 Test back navigation from session to project preserves session list

## 4. Type Definitions

- [x] 4.1 Export Session interface from sessions/repository.ts (if not already exported)
- [x] 4.2 Update ProjectDetailPage component to use Session type