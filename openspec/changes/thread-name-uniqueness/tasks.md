## 1. Domain Layer Validation

- [x] 1.1 Add name uniqueness check in `SessionRepository.addChatThread()` — throw if name already exists in session
- [x] 1.2 Add name uniqueness check in `SessionRepository.updateChatThread()` — throw if new name collides with another thread (excluding self)

## 2. API Layer Error Handling

- [x] 2.1 Update `addChatThreadHandler` to catch repository errors and return HTTP 400 with descriptive message
- [x] 2.2 Update `updateChatThreadHandler` to catch repository errors and return HTTP 400 with descriptive message

## 3. Test Coverage

- [x] 3.1 Add test: POST /sessions/:id/chat-threads rejects duplicate name with 400
- [x] 3.2 Add test: PUT /sessions/:id/chat-threads/:threadId rejects rename to existing name with 400
- [x] 3.3 Add test: Case-sensitive uniqueness ("Foo" vs "foo" allowed)
- [x] 3.4 Add test: Renaming thread to its own name succeeds (no-op)
- [x] 3.5 Run test suite and verify no regressions
