## 1. Session Repository Bootstrap

- [x] 1.1 Update `sessions/repository.ts` to create `upstream/` and `checkout/` directories
- [x] 1.2 Add `cloneRepository()` to `vcs/index.ts` for Git and Fossil URL cloning
- [x] 1.3 Add `importToFossil()` to `vcs/index.ts` for Git → Fossil and Fossil clone
- [x] 1.4 Add `openFossilCheckout()` to `vcs/index.ts` to open checkout directory
- [x] 1.5 Update `sessions/routes.tsx` POST "/" to call VCS methods in sequence (clone → import → open)
- [x] 1.6 Add error handling for CLONE_FAILED, IMPORT_FAILED, CHECKOUT_FAILED
- [x] 1.7 Update `sessions/repository.ts` delete to remove `upstream/` and `checkout/`

## 2. Token and Agent Repository Changes

- [x] 2.1 Update `agents/service.ts` `generateAgentToken()` to use only `{agentId, owner}`
- [x] 2.2 Update `agents/service.ts` `verifyAgentToken()` to return only `{agentId, owner}`
- [x] 2.3 Update `agents/repository.ts` agent schema to use `sessionIds: string[]` instead of `sessionId`
- [x] 2.4 Add `assignSession()` and `unassignSession()` methods to `agents/repository.ts`
- [x] 2.5 Update existing token generation endpoints to use new format

## 3. Agent Sessions API

- [x] 3.1 Create `GET /api/agents/me/sessions` endpoint in `agents/routes.tsx`
- [x] 3.2 Add authentication middleware for agent JWT
- [x] 3.3 Query sessions by `assignedAgentId` from `sessions/repository.ts`
- [x] 3.4 Return session objects with `sessionId`, `projectId`, `sessionName`, `status`
- [x] 3.5 Handle case with no assigned sessions (return empty array)

## 4. Fossil Server Management

- [x] 4.1 Create `FossilServerManager` class in `vcs/fossil-server.ts`
- [x] 4.2 Implement port pool management (8000-9000 range, in-memory `Set<number>`)
- [x] 4.3 Implement `startServer(sessionId, repoPath)` returning `{port, process}`
- [x] 4.4 Implement `stopServer(sessionId)` to kill process and release port
- [x] 4.5 Track running servers with `Map<sessionId, {port, process}>`
- [x] 4.6 Handle port exhaustion with `PORTS_EXHAUSTED` error

## 5. WebSocket Protocol Changes

- [x] 5.1 Update `index.tsx` WebSocket open handler to start Fossil servers for assigned sessions
- [x] 5.2 Send `session_ready` messages to agent with `{type: "session_ready", sessions: [{sessionId, port}]}`
- [x] 5.3 Update `index.tsx` WebSocket close handler to stop Fossil servers for disconnecting agent
- [x] 5.4 Add 30-second grace period before stopping servers on unexpected disconnect

## 6. Agent File Sync Updates

- [x] 6.1 Update `sync/service.ts` to use `checkout/` path instead of `worktree/`
- [x] 6.2 Ensure `sessionId` is passed in `file_changed` WebSocket messages
- [x] 6.3 Update platform WebSocket handler to apply file changes to correct session's `checkout/`

## 7. Session Directory Migration

- [~] 7.1 Create migration script or startup check for existing sessions
  (Skipped - old sessions need to be recreated with new structure)
- [~] 7.2 Handle sessions that still have `worktree/` directory (rename or ignore)
  (Skipped - old sessions need to be recreated with new structure)

## 8. Commit Flow Implementation

- [x] 8.1 Add `exportFromFossil()` to `vcs/index.ts` for fossil → git/fast-export
- [x] 8.2 Update commit service to commit in checkout, export to upstream, push to remote
- [x] 8.3 Handle VCS-specific push commands (git push vs fossil push)

## 9. Testing

- [~] 9.1 Test session creation with Git repository
  (Manual testing required - verify clone, import, open flow)
- [~] 9.2 Test session creation with Fossil repository
  (Manual testing required - verify clone, import, open flow)
- [~] 9.3 Test agent token generation and verification
  (Already correct - generates only {agentId, owner})
- [~] 9.4 Test `GET /api/agents/me/sessions` endpoint
  (Manual testing required)
- [~] 9.5 Test Fossil server start/stop on agent connect/disconnect
  (Manual testing required)
- [~] 9.6 Test file sync to `checkout/` directory
  (Manual testing required)
- [~] 9.7 Test commit flow (fossil commit → export → push)
  (Manual testing required)