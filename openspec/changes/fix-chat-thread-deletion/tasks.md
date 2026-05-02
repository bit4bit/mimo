## 1. Add deleteChatThreadHandler to handlers module

- [ ] 1.1 Read `src/api/rest/sessions/handlers.ts` to understand existing handler patterns
- [ ] 1.2 Implement `deleteChatThreadHandler` following the pattern of other session handlers
- [ ] 1.3 Export the handler from the handlers module

## 2. Wire DELETE route in sessions router

- [ ] 2.1 Read `src/api/rest/sessions.ts` to understand route registration pattern
- [ ] 2.2 Add `router.delete("/:id/chat-threads/:threadId", deleteChatThreadHandler)` after existing chat thread routes
- [ ] 2.3 Import `deleteChatThreadHandler` at the top of the file

## 3. Fix mock helper method name

- [ ] 3.1 Read `test/helpers/mock-fetch.ts`
- [ ] 3.2 Rename `deleteChatThread` to `removeChatThread` in the mock repository

## 4. Add tests

- [ ] 4.1 Read existing session tests to understand test patterns
- [ ] 4.2 Add test for successful thread deletion (200)
- [ ] 4.3 Add test for deleting the last thread (200 — allowed)
- [ ] 4.4 Add test for non-existent session/thread (404)

## 5. Verify

- [ ] 5.1 Run `cd packages/mimo-platform && bun test` — all tests pass
- [ ] 5.2 Confirm no TypeScript errors
