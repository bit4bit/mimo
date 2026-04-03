## Context

The MIMO platform currently has a ProjectDetailPage that shows project metadata (name, description, repo URL, type, owner, created date) but provides no visibility into sessions. Users must manually navigate to `/projects/:projectId/sessions` to view or create sessions, which is not discoverable.

The session management functionality already exists:
- `GET /projects/:projectId/sessions` - Lists sessions for a project
- `GET /projects/:projectId/sessions/new` - Shows session creation form
- `POST /projects/:projectId/sessions` - Creates a new session
- SessionRepository has `listByProject(projectId)` method

## Goals / Non-Goals

**Goals:**
- Display existing sessions on the ProjectDetailPage
- Provide a clear "New Session" button to start development
- Show session name, ID, and status for each session
- Link sessions to their detail pages

**Non-Goals:**
- Session creation directly on project page (keep separate form)
- Session filtering or search (future enhancement)
- Session statistics or metrics (future enhancement)
- Deleting sessions from project page (keep on session detail)

## Decisions

### 1. Session Section Placement

**Decision:** Add a "Sessions" section below project details and above the actions section.

**Rationale:**
- Sessions are the primary workflow in MIMO - users create sessions to work on code
- Placing after project details provides context before actions
- Natural reading flow: project info → sessions → actions

**Alternatives considered:**
- Tab-based UI: Over-engineered for current needs, can add later if needed
- Side-by-side layout: Doesn't work well on mobile/tablet, more complex
- Separate sessions page: Existing, but lack of discoverability is the problem

### 2. Session List Display

**Decision:** Show session name, creation date, and link to session detail.

**Rationale:**
- Minimal but useful information
- Consistent with existing project list pattern
- Clicking session name navigates to session detail page

**Implementation:**
```tsx
<div class="sessions-section">
  <h2>Sessions</h2>
  {sessions.length === 0 ? (
    <p>No sessions yet. Create one to start development.</p>
  ) : (
    <ul>
      {sessions.map(session => (
        <li>
          <a href={`/projects/${projectId}/sessions/${session.id}`}>{session.name}</a>
          <span>{new Date(session.createdAt).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  )}
  <a href={`/projects/${projectId}/sessions/new`} class="btn">New Session</a>
</div>
```

### 3. Data Fetching

**Decision:** Fetch sessions server-side in the existing `/projects/:id` route handler.

**Rationale:**
- Consistent with existing patterns (project list fetches projects)
- No additional API calls from client
- Simple to implement - just add one repository call

**Implementation:**
```typescript
// In routes.tsx, GET /projects/:id
const sessions = await sessionRepository.listByProject(project.id);
return c.html(<ProjectDetailPage project={project} sessions={sessions} />);
```

## Risks / Trade-offs

**Risk:** Many sessions could make page long
→ **Mitigation:** Show most recent 5 sessions with "View All" link (future), or add pagination

**Risk:** Stale session data if sessions change frequently
→ **Mitigation:** Not a concern - page loads fresh on each request, no caching

**Risk:** Performance impact from additional database call
→ **Mitigation:** Session list is small (typically <10), minimal overhead

**Trade-off:** No real-time session status updates
→ **Future:** Could add WebSocket for live status, but not needed for MVP

## Migration Plan

1. Deploy code changes (no data migration needed)
2. Users immediately see sessions on project detail page
3. No rollback needed - additive change

## Open Questions

1. **Should we show active agents count per session?**
   - **Decision:** No, keep minimal. Can add later if needed.

2. **Should "New Session" be primary (filled) or secondary (outline) button?**
   - **Decision:** Primary button - encourages users to start sessions.

3. **Should empty state show helpful text?**
   - **Decision:** Yes, show "No sessions yet. Create one to start development."