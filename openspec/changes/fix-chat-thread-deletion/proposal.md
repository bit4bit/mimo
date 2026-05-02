## Why

The web-facing route for deleting chat threads (`DELETE /sessions/:id/chat-threads/:threadId`) exists and forwards requests to the internal API, but the internal API router never registered the corresponding DELETE handler. This causes all thread deletion attempts from the UI to fail with a 404 Not Found error, even though the repository method `removeChatThread()` exists and works correctly.

## What Changes

- Add `DELETE /:id/chat-threads/:threadId` route to the internal sessions API router (`src/api/rest/sessions.ts`)
- Export `deleteChatThreadHandler` from `src/api/rest/sessions/handlers.ts` that calls `repository.removeChatThread()`
- Remove the artificial "cannot delete last thread" constraint from both the web route and internal API
- Add unit tests for the new endpoint
- Fix mock helper method name mismatch (`deleteChatThread` → `removeChatThread`)

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `session-management`: Chat thread deletion now works end-to-end via the internal API; users may delete any thread including the last one

## Impact

- `packages/mimo-platform/src/api/rest/sessions.ts` — adds DELETE route registration
- `packages/mimo-platform/src/api/rest/sessions/handlers.ts` — adds delete handler export
- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx` — removes "last thread" constraint
- `packages/mimo-platform/test/helpers/mock-fetch.ts` — fixes method name mismatch
- `packages/mimo-platform/test/` — adds test coverage for thread deletion endpoint
