# Design: SCC Refresh via WebSocket

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    IMPACT REFRESH FLOW                          │
└─────────────────────────────────────────────────────────────────┘

  PAGE LOAD
      │
      ▼
  ┌──────────────┐     No polling     ┌──────────────┐
  │ Initial GET  │─────────────────▶│  Display     │
  │ /impact      │                    │  cached data │
  └──────────────┘                    └──────────────┘
                                            │
  FILE CHANGE                               │
      │                                     │
      ▼                                     │
  ┌──────────────┐     WS: impact_stale    │
  │ invalidateCache│──────────────────────▶│
  └──────────────┘    stale: true          │
                                            ▼
                                    ┌──────────────┐
                                    │ Show ⚠️ Stale │
                                    └──────────────┘
                                            │
  REFRESH CLICK                           │
      │                                     │
      ▼                                     │
  ┌──────────────┐                        │
  │ WS: refresh_ │                        │
  │    impact    │                        │
  └──────────────┘                        │
      │                                   │
      ▼                                   │
  ┌──────────────┐     WS: impact_      ▼
  │ Run SCC      │─────│ calculating   (disable button)
  │ (with force) │      └───────────────┘
  └──────────────┘            │
      │                       │
      ▼                       │
  ┌──────────────┐     WS: impact_      │
  │ Results      │─────│ updated       ▼
  └──────────────┘      └───────────────┘
                                │
                                ▼
                        ┌──────────────┐
                        │ Update UI    │
                        │ stale: false │
                        └──────────────┘
```

## WebSocket Message Protocol

### Client → Server

```typescript
interface RefreshImpactMessage {
  type: "refresh_impact";
  sessionId: string;
}
```

### Server → Client

```typescript
interface ImpactStaleMessage {
  type: "impact_stale";
  sessionId: string;
  stale: boolean;
}

interface ImpactCalculatingMessage {
  type: "impact_calculating";
  sessionId: string;
}

interface ImpactUpdatedMessage {
  type: "impact_updated";
  sessionId: string;
  metrics: ImpactMetrics;
  stale: false;
}

interface ImpactErrorMessage {
  type: "impact_error";
  sessionId: string;
  error: string;
}
```

## State Machine

```
                    ┌─────────────┐
                    │   LOADING   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   DISPLAY   │◀────────────────┐
                    │   (fresh)   │                 │
                    └──────┬──────┘                 │
                           │ file change            │
                           ▼                        │
                    ┌─────────────┐     refresh     │
              ┌───▶│   STALE     │─────────────────┘
              │     │  (outdated) │
              │     └──────┬──────┘
              │            │
              │            │ click refresh
              │            ▼
              │     ┌─────────────┐
              │     │ CALCULATING │
              │     └──────┬──────┘
              │            │
              │            │ error
              │            ▼
              └────────────┤    ERROR    │
                           └─────────────┘
```

## Components

### Server-Side Changes

1. **src/index.tsx**
   - Add `refresh_impact` handler in `handleChatMessage`
   - Add helper `broadcastToSession(type, sessionId, data)`
   - Track `calculatingSessions: Set<string>`

2. **src/sync/service.ts**
   - After `invalidateCache()`, call `broadcastImpactStale(sessionId)`
   - Import broadcast helper from index

3. **src/impact/scc-service.ts**
   - Add `isStale(directory): boolean` method
   - Track stale status per directory

### Client-Side Changes

1. **src/components/ImpactBuffer.tsx**
   - Add state: `stale`, `calculating`, `metrics`
   - Add refresh button with icon
   - Listen for WebSocket events
   - Send `refresh_impact` on click

2. **src/components/SessionDetailPage.tsx**
   - Remove polling script (`setInterval(fetchImpact, 5000)`)
   - Keep initial load

## Error Handling

| Scenario | Action |
|----------|--------|
| SCC not installed | Show warning (existing behavior) |
| SCC execution fails | Send `impact_error`, keep stale=true |
| Concurrent refresh | Send `impact_calculating`, ignore duplicate |
| WebSocket disconnect | Reconnect and re-request stale status |

## Testing Strategy

1. Unit tests for `isStale()` method
2. Integration test: file change → stale broadcast
3. Integration test: refresh click → calculation → update
4. E2E: two clients see simultaneous updates
