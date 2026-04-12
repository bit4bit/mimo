# Tasks: SCC Refresh via WebSocket

## Phase 1: Server-Side Infrastructure

### Task 1: Add Stale Tracking to SCC Service
- [x] **File**: `src/impact/scc-service.ts`
- [x] Add `staleDirectories: Set<string>` to track stale state
- [x] Add `markStale(directory: string): void` method
- [x] Add `isStale(directory: string): boolean` method
- [x] Call `markStale()` in `invalidateCache()`
- [x] **Test**: Unit test for stale tracking

### Task 2: Broadcast Helper
- [x] **File**: `src/index.tsx`
- [x] Add `broadcastToSession(sessionId: string, message: object): void` helper
- [x] Reuse existing `chatSessions.get(sessionId)` pattern
- [x] **Test**: Verify broadcast reaches all connected clients

### Task 3: Handle refresh_impact Message
- [x] **File**: `src/index.tsx`
- [x] Add `calculatingSessions: Set<string>` to track in-progress calculations
- [x] Add `case "refresh_impact"` in `handleChatMessage`
- [x] Check if already calculating, send `impact_calculating` if so
- [x] Call `sccService.runScc()` with force=true
- [x] Broadcast `impact_calculating` on start
- [x] Broadcast `impact_updated` on success
- [x] Broadcast `impact_error` on failure
- [x] Remove from `calculatingSessions` when done
- [x] **Test**: Integration test for full refresh flow

### Task 4: File Change Triggers Stale Broadcast
- [x] **File**: `src/sync/service.ts`
- [x] Import broadcast helper from index (or use event emitter)
- [x] After `sccService.invalidateCache()`, call `broadcastImpactStale(sessionId)`
- [x] **Test**: File change → stale message broadcast

## Phase 2: Client-Side UI

### Task 5: Update ImpactBuffer Component
- [x] **File**: `src/components/ImpactBuffer.tsx`
- [x] Add state: `stale: boolean`, `calculating: boolean`, `metrics: ImpactMetrics | null`
- [x] Add refresh button next to title
- [x] Show "⚠️ Outdated" badge when stale=true
- [x] Disable button and show "⏳ Analyzing..." when calculating=true
- [x] Add WebSocket event listeners for `impact_stale`, `impact_calculating`, `impact_updated`, `impact_error`
- [x] Send `refresh_impact` message on button click
- [x] **Test**: Component renders states correctly

### Task 6: Remove Polling from SessionDetailPage
- [x] **File**: `src/components/SessionDetailPage.tsx`
- [x] Remove `setInterval(fetchImpact, 5000)` polling logic
- [x] Keep initial `fetchImpact()` on load
- [x] Remove `lastMetrics` tracking (now in ImpactBuffer state)
- [x] **Test**: Verify no polling occurs

### Task 7: Initial Load Behavior
- [x] **File**: `src/components/ImpactBuffer.tsx`
- [x] On mount, check if metrics exist (from server-side props)
- [x] If no metrics, show "Click Refresh to calculate"
- [x] Request stale status on connect via WebSocket

## Phase 3: Integration & Testing

### Task 8: E2E Test - Happy Path
- [ ] Load session page
- [ ] Click refresh
- [ ] Verify "Analyzing..." appears
- [ ] Verify metrics update
- [ ] Verify stale=false

### Task 9: E2E Test - File Change Detection
- [ ] Load session page
- [ ] Modify file in workspace
- [ ] Verify "⚠️ Outdated" appears within 1 second
- [ ] Click refresh
- [ ] Verify metrics update

### Task 10: E2E Test - Multi-Client Sync
- [ ] Connect Client A to session
- [ ] Connect Client B to same session
- [ ] Client A clicks refresh
- [ ] Verify both clients see updated metrics

### Task 11: Error Handling
- [x] Test SCC execution failure
- [ ] Verify error message displayed
- [x] Test concurrent refresh (double-click)
- [x] Verify only one calculation runs

## Phase 4: Cleanup & Documentation

### Task 12: Remove Unused Code
- [x] Remove polling-related code from SessionDetailPage
- [x] Remove unused `lastMetrics` variable
- [x] Update comments

### Task 13: Documentation
- [ ] Update AGENTS.md if needed
- [x] Add WebSocket message types to API documentation

## Completion Criteria

- [ ] All tasks complete
- [ ] All tests passing
- [ ] Manual testing verified
- [ ] No polling occurring (check network tab)
