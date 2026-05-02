## 1. Data Model Changes

- [ ] 1.1 Add `instructions?: string` to `Project`, `ProjectData`, and `CreateProjectInput` interfaces in `domain/projects/repository.ts`
- [ ] 1.2 Add `instructions?: string` to `Session`, `SessionData`, and `CreateSessionInput` interfaces in `domain/sessions/repository.ts`
- [ ] 1.3 Add `instructions?: string` to `ChatThread` interface in `domain/sessions/repository.ts`
- [ ] 1.4 Update `ProjectRepository.create()` to accept and persist instructions
- [ ] 1.5 Update `ProjectRepository.update()` to handle instructions field
- [ ] 1.6 Update `SessionRepository.create()` to accept and persist instructions
- [ ] 1.7 Update `SessionRepository.update()` to handle instructions field
- [ ] 1.8 Update `SessionRepository.addChatThread()` to accept and persist instructions
- [ ] 1.9 Update `SessionRepository.updateChatThread()` to handle instructions field

## 2. REST API Updates

- [ ] 2.1 Update project request/response types to include instructions
- [ ] 2.2 Update `createProjectHandler` to accept instructions
- [ ] 2.3 Update `updateProjectHandler` to accept instructions
- [ ] 2.4 Update `toProjectResponse` to include instructions
- [ ] 2.5 Update session request/response types to include instructions
- [ ] 2.6 Update `createSessionHandler` to accept instructions
- [ ] 2.7 Update `updateSessionHandler` to accept instructions
- [ ] 2.8 Update `toSessionResponse` to include instructions
- [ ] 2.9 Update `addChatThreadHandler` to accept instructions
- [ ] 2.10 Update `updateChatThreadHandler` to accept instructions
- [ ] 2.11 Update `toChatThreadResponse` to include instructions

## 3. Thread Creation Instructions Injection

- [ ] 3.1 Create `resolveThreadInstructions()` utility function implementing Thread > Session > Project hierarchy
- [ ] 3.2 Update `addChatThreadHandler` to resolve instructions and save as system message to chat history
- [ ] 3.3 Ensure system message is saved with `role: "system"` and current timestamp

## 4. Agent Integration

- [ ] 4.1 Add `initial_prompt` message type handling in `mimo-agent/src/index.ts`
- [ ] 4.2 Send instructions to agent via WebSocket when thread is created (if agent is connected)
- [ ] 4.3 Handle agent not connected case (queue or skip)

## 5. UI Updates

- [ ] 5.1 Add instructions textarea to project creation form
- [ ] 5.2 Add instructions textarea to project edit form
- [ ] 5.3 Add instructions textarea to session creation form
- [ ] 5.4 Add instructions textarea to session edit form
- [ ] 5.5 Add instructions textarea to chat thread creation form
- [ ] 5.6 Add instructions textarea to chat thread edit form
- [ ] 5.7 Display instructions in thread detail/chat view

## 6. Tests

- [ ] 6.1 Write integration test for project-level instructions
- [ ] 6.2 Write integration test for session-level override
- [ ] 6.3 Write integration test for thread-level override
- [ ] 6.4 Write integration test for no instructions case
- [ ] 6.5 Write integration test for instructions API CRUD
- [ ] 6.6 Run full test suite and fix any regressions
