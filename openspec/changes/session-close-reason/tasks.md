## 1. Data Model

- [ ] 1.1 Add `closeReason?: string` to `Session` interface in `src/sessions/repository.ts`
- [ ] 1.2 Add `closeReason?: string` to `SessionData` interface in `src/sessions/repository.ts`
- [ ] 1.3 Update `SessionListItem` interface in `src/components/SessionList.tsx` to include optional `closeReason`

## 2. Backend Routes

- [ ] 2.1 Add `GET /:id/close` route handler in `src/sessions/routes.tsx` that renders close form page
- [ ] 2.2 Update `POST /:id/close` route handler in `src/sessions/routes.tsx` to accept `closeReason` from form body
- [ ] 2.3 Ensure close and cancel redirect to session detail page (use Referer or fallback)

## 3. UI Components

- [ ] 3.1 Update close button in `SessionDetailPage.tsx` to link to `GET /close` page instead of direct POST form
- [ ] 3.2 Update close button in `ProjectsSessionsPage.tsx` to link to `GET /close` page
- [ ] 3.3 Display `closeReason` in `ProjectsSessionsPage.tsx` for closed sessions (muted text next to status)
- [ ] 3.4 Display `closeReason` in `SessionList.tsx` for closed sessions (if applicable)

## 4. Tests

- [ ] 4.1 Add test: GET close page renders form with session name
- [ ] 4.2 Add test: POST close with reason persists closeReason
- [ ] 4.3 Add test: POST close without reason allows empty closeReason
- [ ] 4.4 Add test: Cancel redirects back to session detail without closing
- [ ] 4.5 Add test: Close reason appears in session list for closed sessions
- [ ] 4.6 Run existing tests to ensure no regressions

## 5. Verification

- [ ] 5.1 Manually test close flow from SessionDetailPage
- [ ] 5.2 Manually test close flow from ProjectsSessionsPage
- [ ] 5.3 Verify cancel button returns to correct page
- [ ] 5.4 Verify close reason displays in session lists
