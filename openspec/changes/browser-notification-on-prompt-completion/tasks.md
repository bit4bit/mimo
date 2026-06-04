## 1. Backend Model and Repository Changes

- [ ] 1.1 Add `browserNotificationsEnabled?: boolean` to `Session` and `SessionData` interfaces in `repository.ts`
- [ ] 1.2 Add default `browserNotificationsEnabled: false` to `SessionRepository.create` and backward-compatible default in all normalization paths (`findById`, `findByProjectAndId`, `listByProject`, `listAll`, `findByAssignedAgentId`, `findByThreadAgentId`)
- [ ] 1.3 Add `browserNotificationsEnabled` to `toSessionResponse` in internal API types (`src/api/rest/sessions/types.ts`)
- [ ] 1.4 Add `browserNotificationsEnabled` to `UpdateSessionRequest` in internal API types
- [ ] 1.5 Accept `browserNotificationsEnabled` in `updateSessionConfig` in `repository.ts`
- [ ] 1.6 Update internal API session config handlers (`src/api/rest/sessions/handlers.ts`) to handle `browserNotificationsEnabled`

## 2. Backend Web Route Changes

- [ ] 2.1 PATCH `/:id/config` web route (`src/web/features/sessions/pages/sessions.tsx`) accepts `browserNotificationsEnabled` in request body
- [ ] 2.2 Validation logic in PATCH route ensures `browserNotificationsEnabled` is a boolean if provided

## 3. Frontend Settings UI

- [ ] 3.1 `SessionSettingsPage` component (`src/web/features/sessions/components/SessionSettingsPage.tsx`) renders a "Browser notifications" checkbox
- [ ] 3.2 Checkbox state reflects `session.browserNotificationsEnabled`
- [ ] 3.3 Changing the checkbox triggers a PATCH to `/:id/config` to persist the toggle

## 4. Frontend Notification Logic

- [ ] 4.1 Add notification helper functions in `chat.js` (request permission, show notification)
- [ ] 4.2 On `prompt_completed` in `handleWebSocketMessage`, check `document.hidden` and session enabled flag
- [ ] 4.3 If conditions met, show "Response ready" notification
- [ ] 4.4 Click handler on notification brings window to focus

## 5. Tests

- [ ] 5.1 Backend integration test: session default `browserNotificationsEnabled` is `false`
- [ ] 5.2 Backend integration test: PATCH config updates `browserNotificationsEnabled`
- [ ] 5.3 Backend integration test: `browserNotificationsEnabled` appears in API response
- [ ] 5.4 Frontend integration test: `finalizeMessageStream` (or equivalent entry point) triggers notification only when hidden and enabled

## 6. Verification and Cleanup

- [ ] 6.1 Run backend test suite
- [ ] 6.2 Run frontend test suite
- [ ] 6.3 Verify no TypeScript errors
