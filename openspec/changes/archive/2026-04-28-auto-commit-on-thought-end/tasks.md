## 1. Core Service Implementation

- [x] 1.1 Create AutoCommitService at `src/auto-commit/service.ts`
  - Implement `handleThoughtEnd(sessionId: string)` method
  - Check for uncommitted changes using VCS status
  - Skip if no changes
  - Call CommitService.commitAndPush() with generated message
  - Record sync status (timestamp or error)

- [x] 1.2 Add commit message generation
  - Get session name from sessionRepository
  - Calculate file/line stats using ImpactCalculator
  - Format: `"[SessionName] - X files changed (+Y/-Z lines)"`

- [x] 1.3 Create sync status tracking
  - Add syncStatus field to session state or separate tracking
  - Store: lastSyncAt, lastSyncError, syncState ('idle' | 'syncing' | 'error')

## 2. Event Integration

- [x] 2.1 Wire into SessionBroadcast
  - Subscribe to `thought_end` events
  - Call AutoCommitService.handleThoughtEnd()
  - Handle async without blocking broadcast

- [x] 2.2 Add error handling
  - Catch commit/push errors
  - Store error details for UI display
  - Don't crash on sync failure

## 3. API Routes

- [x] 3.1 Create sync route at `src/auto-commit/routes.ts`
  - POST `/sessions/:sessionId/sync` - Manual sync trigger
  - GET `/sessions/:sessionId/sync-status` - Get current sync status
  - Return appropriate success/error responses

- [x] 3.2 Register routes in main app
  - Import and mount auto-commit router

## 4. UI Components

- [x] 4.1 Add sync status display to session page
  - Show last sync time
  - Show error state if applicable
  - Update via WebSocket or polling

- [x] 4.2 Add manual "Sync Now" button
  - Call POST `/sessions/:sessionId/sync`
  - Show loading state during sync
  - Show success/error feedback

## 5. Testing

- [x] 5.1 Write tests for AutoCommitService
  - Test: thought_end with changes triggers commit
  - Test: thought_end without changes skips commit
  - Test: commit message format is correct
  - Test: sync status is recorded

- [x] 5.2 Write tests for sync API
  - Test: manual sync endpoint works
  - Test: sync-status endpoint returns correct state
  - Test: error handling

- [x] 5.3 Write integration tests
  - Test: full flow from thought_end to commit
  - Test: error propagation to UI

## 6. Documentation

- [x] 6.1 Update AGENTS.md if needed
  - Document auto-commit behavior
  - Explain manual sync fallback
