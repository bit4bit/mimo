## 1. Backend Model and Repository Changes

- [x] 1.1 Add `browserNotificationsEnabled?: boolean` to `Session` and `SessionData` interfaces in `repository.ts`
- [x] 1.2 Add default `browserNotificationsEnabled: false` to `SessionRepository.create` and backward-compatible default in all normalization paths (`findById`, `findByProjectAndId`, `listByProject`, `listAll`, `findByAssignedAgentId`, `findByThreadAgentId`)
- [x] 1.3 Add `browserNotificationsEnabled` to `toSessionResponse` in internal API types (`src/api/rest/sessions/types.ts`)
- [x] 1.4 Add `browserNotificationsEnabled` to `UpdateSessionRequest` in internal API types
- [x] 1.5 Accept `browserNotificationsEnabled` in `updateSessionConfig` in `repository.ts`
- [x] 1.6 Update internal API session config handlers (`src/api/rest/sessions/handlers.ts`) to handle `browserNotificationsEnabled`

## 2. Backend Web Route Changes

- [x] 2.1 PATCH `/:id/config` web route (`src/web/features/sessions/pages/sessions.tsx`) accepts `browserNotificationsEnabled` in request body
- [x] 2.2 Validation logic in PATCH route ensures `browserNotificationsEnabled` is a boolean if provided

## 3. Frontend Settings UI

- [x] 3.1 `SessionSettingsPage` component (`src/web/features/sessions/components/SessionSettingsPage.tsx`) renders a "Browser notifications" checkbox
- [x] 3.2 Checkbox state reflects `session.browserNotificationsEnabled`
- [x] 3.3 Changing the checkbox triggers a PATCH to `/:id/config` to persist the toggle

## 4. Frontend Notification Logic

- [x] 4.1 Add notification helper functions in `chat.js` (request permission, show notification)
- [x] 4.2 On `prompt_completed` in `handleWebSocketMessage`, check `document.hidden` and session enabled flag
- [x] 4.3 If conditions met, show "Response ready" notification
- [x] 4.4 Click handler on notification brings window to focus

## 5. Tests

- [x] 5.1 Backend integration test: session default `browserNotificationsEnabled` is `false`
- [x] 5.2 Backend integration test: PATCH config updates `browserNotificationsEnabled`
- [x] 5.3 Backend integration test: `browserNotificationsEnabled` appears in API response
- [x] 5.4 Frontend integration test: notification triggers only when hidden and enabled

## 6. Verification and Cleanup

- [x] 6.1 Run backend test suite — 45/45 pass
- [x] 6.2 Run frontend test suite — 6/6 pass
- [x] 6.3 Verify no TypeScript errors — all our changed files clean (pre-existing error in `ChatThreadsBuffer.tsx` unrelated)
