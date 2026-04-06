## 1. mimo-platform - Data Model Changes

- [x] 1.1 Add `defaultLocalDevMirrorPath` field to Project model in `projects/repository.ts`
- [x] 1.2 Add `localDevMirrorPath` field to Session model in `sessions/repository.ts`
- [x] 1.3 Update CreateProjectInput interface to include `defaultLocalDevMirrorPath`
- [x] 1.4 Update CreateSessionInput interface to include `localDevMirrorPath`

## 2. mimo-platform - Project Forms

- [x] 2.1 Add "Local Development Mirror" input field to ProjectCreatePage component
- [x] 2.2 Add "Local Development Mirror" input field to ProjectEditPage component
- [x] 2.3 Add help text explaining the field (optional path for local dev mirror)
- [x] 2.4 Handle empty value (store as undefined/null)

## 3. mimo-platform - Session Forms

- [x] 3.1 Update SessionCreatePage to accept project and pre-fill mirror path from `project.defaultLocalDevMirrorPath`
- [x] 3.2 Add "Local Development Mirror" input field with pre-filled value
- [x] 3.3 Allow user to clear the field (no mirror sync)
- [x] 3.4 Store the value (or null) when creating session

## 4. mimo-platform - WebSocket Protocol

- [x] 4.1 Extend session_ready message in `index.tsx` to include `localDevMirrorPath`
- [x] 4.2 Update session object construction to read `localDevMirrorPath` from session

## 5. mimo-agent - Data Model Changes

- [x] 5.1 Add `localDevMirrorPath` field to SessionInfo type in `types.ts`
- [x] 5.2 Add `setSessionLocalDevMirrorPath` method to SessionManager

## 6. mimo-agent - Message Handling

- [x] 6.1 Update `handleSessionReady` to extract `localDevMirrorPath` from session data
- [x] 6.2 Store mirror path in session context via SessionManager

## 7. mimo-agent - File Sync Implementation

- [x] 7.1 Create `syncToMirror` utility function in `session.ts`
- [x] 7.2 Skip sync if `localDevMirrorPath` is null/undefined
- [x] 7.3 Skip `.git/` and `.fossil/` directories in sync
- [x] 7.4 Create parent directories if they don't exist
- [x] 7.5 Copy file content from checkout to mirror path
- [x] 7.6 Handle file deletion (remove from mirror)
- [x] 7.7 Log warnings on permission errors but continue
- [x] 7.8 Integrate sync into `flushPendingChanges` alongside existing `onFileChange` callback

## 8. Testing

- [x] 8.1 Write test: Project created with default mirror path stores correctly
- [x] 8.2 Write test: Session inherits project default mirror path
- [x] 8.3 Write test: Session can override with custom path
- [x] 8.4 Write test: Session created without mirror path stores null
- [x] 8.5 Write test: session_ready includes localDevMirrorPath
- [x] 8.6 Write test: Agent syncs new files to mirror
- [x] 8.7 Write test: Agent syncs modified files to mirror (agent wins)
- [x] 8.8 Write test: Agent deletes files from mirror on deletion
- [x] 8.9 Write test: Agent skips .git and .fossil directories
- [x] 8.10 Write test: Agent handles missing mirror path gracefully
- [x] 8.11 Write test: Agent handles permission errors gracefully

## 9. Integration Testing

- [x] 9.1 Test end-to-end flow: Project with default → Session creation → Agent sync
- [x] 9.2 Test edge case: Project default changed after session created
- [x] 9.3 Test edge case: Session path cleared after creation
- [x] 9.4 Verify immediate sync (no delay beyond file watcher debounce)

## 10. Documentation

- [x] 10.1 Update agent README with local dev mirror feature
- [x] 10.2 Update platform README with new form fields
- [x] 10.3 Add inline code comments for mirror sync logic
