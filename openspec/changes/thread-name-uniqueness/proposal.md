## Why

Currently, multiple chat threads within the same session can have identical names, causing confusion in the UI and making it impossible for users to distinguish threads by name. Enforcing uniqueness per session provides clear identity for each thread and prevents ambiguous references.

## What Changes

- Add uniqueness validation in `SessionRepository` for chat thread names within a session
- Reject thread creation (`addChatThread`) with a clear error when a name already exists in the session
- Reject thread rename (`updateChatThread`) with a clear error when the new name collides with another thread
- Update REST API handlers to return HTTP 400 with descriptive error message on name collision
- Add test coverage verifying duplicate names are rejected for both creation and rename operations

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `chat-threads`: Add requirement that thread names must be unique per session (case-sensitive)

## Impact

- `packages/mimo-platform/src/domain/sessions/repository.ts` — `addChatThread()` and `updateChatThread()` methods
- `packages/mimo-platform/src/api/rest/sessions/handlers.ts` — `addChatThreadHandler` and `updateChatThreadHandler` error handling
- `packages/mimo-platform/test/chat-threads.test.ts` — new test cases for uniqueness enforcement
- No breaking API contract changes (HTTP 400 is already the expected error response format)
