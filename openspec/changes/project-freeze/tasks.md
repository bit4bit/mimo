## 1. Session Status Type

- [x] 1.1 Add `frozen` to Session status enum in session repository
- [x] 1.2 Update Session interface type definition to include `frozen`
- [x] 1.3 Update SessionData interface type definition to include `frozen`

## 2. Project Freeze Action

- [x] 2.1 Create POST route handler for `/projects/:id/freeze`
- [x] 2.2 Implement freeze logic: list all sessions for project, update each to `frozen`
- [x] 2.3 Add freeze route to project routes

## 3. Block Chat Messages for Frozen Sessions

- [x] 3.1 Add status check in chat message handler
- [x] 3.2 Return error response when session is frozen

## 4. Block Commits for Frozen Sessions

- [x] 4.1 Add status check in commit service
- [x] 4.2 Return error response when session is frozen

## 5. UI Updates

- [x] 5.1 Add "Freeze Project" button to ProjectDetailPage Actions section
- [x] 5.2 Create POST form for freeze action
- [x] 5.3 Verify `frozen` status displays correctly in sessions list

## 6. Tests

- [x] 6.1 Test session status can be set to frozen
- [x] 6.2 Test freeze action marks all project sessions as frozen
- [x] 6.3 Test chat messages blocked for frozen sessions
- [x] 6.4 Test commits blocked for frozen sessions
