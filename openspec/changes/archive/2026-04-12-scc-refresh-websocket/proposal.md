# SCC Refresh via WebSocket

## Summary

Replace automatic polling with event-driven SCC metrics. Add manual refresh button and real-time stale indicator via WebSocket.

## Motivation

Current implementation polls `/sessions/:id/impact` every 5 seconds, causing unnecessary load and stale data display. We want:

1. No polling (reduces server load)
2. Manual refresh (user control)
3. Real-time stale indicator (when files change)

## Scope

**In Scope:**
- Remove automatic polling from SessionDetailPage
- Add refresh button to ImpactBuffer
- Add WebSocket message handlers for impact updates
- Broadcast stale status when files change
- Track calculation state to prevent duplicate requests

**Out of Scope:**
- Changing SCC installation/behavior
- Modifying cache mechanism (just expose stale status)
- Auto-recalculation on file change (must be manual)

## Success Criteria

- [ ] No automatic polling occurs
- [ ] Refresh button triggers SCC calculation
- [ ] Stale badge appears when files change
- [ ] "Calculating..." state shown during refresh
- [ ] Multiple clients see updates simultaneously

## Risks

| Risk | Mitigation |
|------|------------|
| WebSocket disconnections | Stale status recalculated on reconnect |
| Long-running scc | Show progress indicator, allow cancellation |
| Concurrent refreshes | Track `calculating` state per session |

## Related

- `sync/service.ts` - file change detection
- `impact/scc-service.ts` - cache invalidation
- `index.tsx` - WebSocket message handling
