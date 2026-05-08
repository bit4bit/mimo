# Tasks: Add Force Push Button

## 1. VCS Layer

- [x] 1.1 Add `options?: { force?: boolean }` parameter to `pushUpstream()`
- [x] 1.2 For git: append `--force` to `pushArgs` when `options.force` is true
- [x] 1.3 For fossil: append `--force` to `fossil push` when `options.force` is true
- [x] 1.4 Add unit test: `vcs.test.ts` - force push for git and fossil

## 2. Commit Service

- [x] 2.1 Add `forcePush(sessionId: string)` method to `CommitService`
- [x] 2.2 Resolve session, get upstream path and repo type
- [x] 2.3 Call `vcs.pushUpstream()` with `force: true`
- [x] 2.4 Return `CommitAndPushResult`-shaped response

## 3. API Routes

- [x] 3.1 Add `POST /commits/:sessionId/push-force` endpoint in `commits.ts`
- [x] 3.2 Call `service.forcePush(sessionId)`
- [x] 3.3 Return JSON response with success/message/error

## 4. Frontend - Session Detail Page

- [x] 4.1 Add "Force Push" button to `SessionDetailPage.tsx` action bar
- [x] 4.2 Style as `btn-danger` with warning tooltip
- [x] 4.3 On click: `fetch POST /commits/${sessionId}/push-force`
- [x] 4.4 Show inline success/error message (reuse `commitStatus` element)

## 5. Integration Test

- [x] 5.1 Add test: force push endpoint returns success when push works
- [x] 5.2 Add test: force push endpoint returns error when auth fails
