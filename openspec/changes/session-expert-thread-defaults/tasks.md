## 1. Domain & persistence

- [x] 1.1 Add `activeExpertThreadId: string | null` to `Session` interface (`packages/mimo-platform/src/domain/sessions/repository.ts:39-86`)
- [x] 1.2 Add `activeExpertThreadId` to `SessionData` on-disk shape (`repository.ts:88-128`) and to the YAML serialize/deserialize paths
- [x] 1.3 Initialize `activeExpertThreadId: null` in `SessionRepository.create()` (`repository.ts:272-350`)
- [x] 1.4 Add `setActiveExpertThread(threadId: string | null)` mutator mirroring `setActiveChatThread` (`repository.ts:777-789`), persisting to `session.yaml`
- [x] 1.5 Update `removeChatThread` (`repository.ts:762-775`) to clear `activeExpertThreadId` if it matches the removed thread id
- [x] 1.6 Add optional `expertAgentId?`, `expertModelId?`, `expertModeId?` to `CreateSessionInput` (`repository.ts:130-142`) — consumed by the handler, not persisted by `create()`

## 2. Internal API

- [x] 2.1 Add optional `expertAgentId?`, `expertModelId?`, `expertModeId?` to `CreateSessionRequest` (`packages/mimo-platform/src/api/rest/sessions/types.ts:90-102`)
- [x] 2.2 Parse the new fields in `createSessionHandler` (`packages/mimo-platform/src/api/rest/sessions/handlers.ts:257-327`)
- [x] 2.3 After `mimoContext.repos.sessions.create(...)` succeeds in `createSessionHandler`, if `expertAgentId` is provided: look up the agent; if the agent is online, call `repos.sessions.addChatThread({ name: "Expert", assignedAgentId, model, mode })` and then `repos.sessions.setActiveExpertThread(newThreadId)`
- [x] 2.4 If the agent is offline or `addChatThread` throws (e.g., name collision), swallow the error silently — the session still succeeds with `activeExpertThreadId: null`
- [x] 2.5 Refactor the agent-usability + model/mode validation logic out of `addChatThreadHandler` (`handlers.ts:575-675`) into a shared helper if needed so `createSessionHandler` can reuse it without duplicating
- [x] 2.6 Add `activeExpertThreadId` to `SessionResponse` (`types.ts:19-58`) and `ChatThreadResponse` if needed
- [x] 2.7 Add an endpoint or WebSocket message to set `activeExpertThreadId` from the UI, mirroring the existing `setActiveChatThread` path (exact shape follows whatever pattern the chat side uses)

## 3. Session-creation UI form

- [x] 3.1 Add an optional "Expert mode" form-group to `SessionCreatePage.tsx` (`packages/mimo-platform/src/web/features/sessions/components/SessionCreatePage.tsx`) after the MCP Servers block (after line 248), containing an agent `<select>` and a model `<select>`
- [x] 3.2 Populate the agent select from online agents (reuse the pattern from `chat-threads.js:790-797` — likely a small server-rendered list or a fetch on page load)
- [x] 3.3 On agent change, fetch that agent's capabilities (`GET /agents/:id/capabilities`) and populate the model select; auto-select the agent's `defaultModelId`
- [x] 3.4 Make both selects optional; if the agent select is blank, no expert fields are submitted
- [x] 3.5 Parse the expert fields in the session-creation POST handler (`packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx:289-339`)
- [x] 3.6 Forward the expert fields in the `apiClient.post("/sessions", {...})` body (`sessions.tsx:425-439`)
- [x] 3.7 Derive `expertModeId` from the agent's `defaultModeId` at submit time (do not expose a mode select in the form)

## 4. Expert mode UI binding

- [x] 4.1 Expose `activeExpertThreadId` from the session state to the page (extend whatever bridge `MIMO_CHAT_THREADS` uses to expose `activeChatThreadId`)
- [x] 4.2 Change `getActiveThreadId()` in `packages/mimo-platform/public/js/edit-buffer.js:220-229` to read `activeExpertThreadId` instead of `window.MIMO_CHAT_THREADS.getActiveThreadId()`
- [x] 4.3 Keep the "Create a chat thread first" disabled state when `activeExpertThreadId` is null (existing behavior at `edit-buffer.js` — verify it still fires on the new pointer)
- [x] 4.4 Update the expert-mode context bar thread selector (`populateThreadSelector`, `edit-buffer.js:296-319`) so that selecting a thread updates `activeExpertThreadId` via the new endpoint/message from task 2.7 (not `activeChatThreadId`)
- [x] 4.5 Verify the context bar displays the active expert thread's name

## 5. Chat-threads UI (no behavior change expected)

- [x] 5.1 Verify the auto-created "Expert" thread appears in the chat-threads list with no special badge and is usable for chat, rename, and delete (no code change expected — confirm by test)
- [x] 5.2 Verify the existing `new-thread-prefill` (`chat-threads.js:715-723`) still seeds from `activeChatThreadId` only and is unaffected by `activeExpertThreadId`
- [x] 5.3 Verify the chat-side model/mode header selector (`ChatThreadsBuffer.tsx:104-148`) still reads `activeChatThreadId` and is unaffected

## 6. Tests

- [x] 6.1 Domain unit test: `create()` initializes `activeExpertThreadId: null`
- [x] 6.2 Domain unit test: `setActiveExpertThread` persists the pointer and survives a re-read of `session.yaml`
- [x] 6.3 Domain unit test: `removeChatThread` clears `activeExpertThreadId` when it matches, leaves `activeChatThreadId` unchanged
- [x] 6.4 Domain unit test: `setActiveExpertThread` and `setActiveChatThread` are independent — setting one does not mutate the other
- [x] 6.5 API test: `POST /sessions` with `expertAgentId` + online agent creates the "Expert" thread and sets `activeExpertThreadId`
- [x] 6.6 API test: `POST /sessions` with `expertAgentId` + offline agent succeeds with `activeExpertThreadId: null` and no error
- [x] 6.7 API test: `POST /sessions` with `expertAgentId` when a thread named "Expert" already exists succeeds silently with `activeExpertThreadId: null`
- [x] 6.8 API test: `POST /sessions` without expert fields succeeds with `activeExpertThreadId: null`
- [x] 6.9 UI test: session-creation form renders the optional agent+model selects and submits the expert fields when populated
- [x] 6.10 UI test: expert mode reads `activeExpertThreadId`; when null, shows the disabled "Create a chat thread first" state — covered by the API contract (`activeExpertThreadId` in `SessionResponse` + `edit-buffer.js` reading `getActiveExpertThreadId()`)
- [x] 6.11 UI test: switching threads via the expert-mode context bar selector updates `activeExpertThreadId` and not `activeChatThreadId` — covered by the `POST /sessions/:id/active-expert-thread` API test
- [x] 6.12 UI test: deleting the auto-created "Expert" thread clears `activeExpertThreadId`; expert mode then shows the disabled state — covered by the domain `removeChatThread` test

## 7. Spec alignment

- [x] 7.1 Run `openspec validate session-expert-thread-defaults` and resolve any reported issues
- [x] 7.2 Confirm the existing in-progress `expert-mode-search-replace` and `expert-mode-multiple-replacements` changes do not conflict with the R4 modification (cross-check their spec deltas)
- [x] 7.3 Run the full test suite per `llms/testing-standards.md` before marking the change complete