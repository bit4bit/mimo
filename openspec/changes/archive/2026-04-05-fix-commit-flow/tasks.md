## 1. Session Repository Changes

- [x] 1.1 Rename `getCheckoutPath()` to `getAgentWorkspacePath()` in sessions/repository.ts
- [x] 1.2 Update Session interface: `checkoutPath: string` → `agentWorkspacePath: string`
- [x] 1.3 Update SessionData interface with renamed field
- [x] 1.4 Update directory creation logic to create `agent-workspace/` instead of `checkout/`
- [x] 1.5 Update session.yaml write logic to use `agentWorkspacePath` field name
- [x] 1.6 Update session.yaml read logic to handle both old `checkoutPath` and new `agentWorkspacePath`

## 2. Session Routes Updates

- [x] 2.1 Update all `checkoutPath` references in sessions/routes.tsx to `agentWorkspacePath`
- [x] 2.2 Update file tree scanning logic to use new path name
- [x] 2.3 Update chat persistence to use new path name

## 3. File Sync Service Updates

- [x] 3.1 Update FileSyncState interface: `checkoutPath` → `agentWorkspacePath`
- [x] 3.2 Update initializeSession() parameter names
- [x] 3.3 Update syncChangesToUpstream() to use renamed paths
- [x] 3.4 Update scanSessionCheckout() to use renamed paths
- [x] 3.5 Update manualPullFromOriginal() to use renamed paths
- [x] 3.6 Update resolveConflict() to use renamed paths

## 4. VCS Module New Methods

- [x] 4.1 Add `fossilUp(agentWorkspacePath: string)` method to sync agent-workspace with repo.fossil
- [x] 4.2 Add `cleanCopyToUpstream(agentWorkspacePath, upstreamPath)` method
- [x] 4.3 Implement clean copy logic: preserve `.git/` and `.fossil`, delete other files, copy from agent-workspace
- [x] 4.4 Add `commitUpstream(upstreamPath, repoType)` method with timestamp message
- [x] 4.5 Implement Git commit: `git add -A && git commit -m "Mimo commit at <timestamp>"`
- [x] 4.6 Implement Fossil commit: `fossil addremove && fossil commit -m "Mimo commit at <timestamp>"`
- [x] 4.7 Add `pushUpstream(upstreamPath, repoType, branch?)` method
- [x] 4.8 Implement Git push: `git push origin <branch>`
- [x] 4.9 Implement Fossil push: `fossil push`

## 5. Commit Service Rewrite

- [x] 5.1 Rewrite `commit()` method to implement four-step flow
- [x] 5.2 Step 1: Call `vcs.fossilUp()` to sync with agent's latest changes
- [x] 5.3 Step 2: Call `vcs.cleanCopyToUpstream()` to copy files
- [x] 5.4 Step 3: Call `vcs.commitUpstream()` to commit in upstream
- [x] 5.5 Step 4: Remove old fossil-based commit logic
- [x] 5.6 Update CommitResult interface to include new fields if needed
- [x] 5.7 Add proper error handling with user-friendly messages
- [x] 5.8 Remove `push()` method (logic merged into commit flow)
- [x] 5.9 Update `commitAndPush()` to use new `commit()` flow
- [x] 5.10 Get project repoType in commit service for VCS operations

## 6. Routes and API Updates

- [x] 6.1 Update commits/routes.ts to handle new commit flow responses
- [x] 6.2 Remove separate `/push` endpoint if no longer needed
- [x] 6.3 Update commit dialog JavaScript to show new error messages
- [x] 6.4 Update commit status display for new flow results

## 7. Test Updates

- [x] 7.1 Update session repository tests for renamed field
- [x] 7.2 Update sync service tests for renamed paths
- [x] 7.3 Create tests for new VCS methods (fossilUp, cleanCopyToUpstream, commitUpstream, pushUpstream)
- [x] 7.4 Rewrite commit service tests for new flow
- [x] 7.5 Add test: fossil up syncs agent changes
- [x] 7.6 Add test: clean copy removes old files
- [x] 7.7 Add test: Git upstream commit and push
- [x] 7.8 Add test: Fossil upstream commit and push
- [x] 7.9 Add test: no changes scenario
- [x] 7.10 Add test: push failure error handling

## 8. Documentation and Migration

- [x] 8.1 Update session directory documentation in README
- [x] 8.2 Document breaking change: old sessions need recreation
- [x] 8.3 Update API documentation for commit endpoint
- [x] 8.4 Add migration note: sessions created before this change have checkoutPath in YAML

## 9. Final Verification

- [x] 9.1 Verify all `checkoutPath` references updated to `agentWorkspacePath`
- [x] 9.2 Run full test suite
- [x] 9.3 Manual test: Create new session, make agent changes, commit and push
- [x] 9.4 Manual test: Verify error messages display correctly
- [x] 9.5 Verify session.yaml uses new field name
