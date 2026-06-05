## 1. Data Model

- [x] 1.1 Add `closeReason?: string` to `Session` interface in `src/sessions/repository.ts`
- [x] 1.2 Add `closeReason?: string` to `SessionData` interface in `src/sessions/repository.ts`
- [x] 1.3 Update `SessionListItem` interface in `src/components/SessionList.tsx` to include optional `closeReason`

## 2. Backend Routes

- [x] 2.1 Add `GET /:id/close` route handler in `src/sessions/routes.tsx` that renders close form page with a radio group (`implemented`, `invalid expectations`, `wrong implementation`, `no reason`) and an optional note input
- [x] 2.2 Update `POST /:id/close` route handler in `src/sessions/routes.tsx` to accept `reason` (radio value) and `note` from form body
- [x] 2.3 Resolve `closeReason` in the POST handler: trimmed `note` when non-empty, else the `reason` radio label, else `undefined` when `reason` is `no reason` with empty note (never concatenate radio label and note)
- [x] 2.4 Ensure close and cancel redirect to session detail page (use Referer or fallback)

## 3. UI Components

- [x] 3.1 Update close button in `SessionDetailPage.tsx` to link to `GET /close` page instead of direct POST form
- [x] 3.2 Update close button in `ProjectsSessionsPage.tsx` to link to `GET /close` page
- [x] 3.3 Display `closeReason` in `ProjectsSessionsPage.tsx` for closed sessions (muted text next to status)
- [x] 3.4 Display `closeReason` in `SessionList.tsx` for closed sessions (if applicable)

## 4. Tests

- [x] 4.1 Add test: GET close page renders the radio group (4 options) and note input with session name
- [x] 4.2 Add test: POST close with a radio selection and empty note persists the radio label as `closeReason`
- [x] 4.3 Add test: POST close with a note overrides the radio selection (stores note, not combined)
- [x] 4.4 Add test: POST close with `no reason` and empty note stores `closeReason: undefined`
- [x] 4.5 Add test: POST close with `no reason` and a note stores the note
- [x] 4.6 Add test: Cancel redirects back to session detail without closing
- [x] 4.7 Add test: Close reason appears in session list for closed sessions
- [x] 4.8 Run existing tests to ensure no regressions

## 5. Verification

- [ ] 5.1 Manually test close flow from SessionDetailPage
- [ ] 5.2 Manually test close flow from ProjectsSessionsPage
- [ ] 5.3 Verify cancel button returns to correct page
- [ ] 5.4 Verify close reason displays in session lists
