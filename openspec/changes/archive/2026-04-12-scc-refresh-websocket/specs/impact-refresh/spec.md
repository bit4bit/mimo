# Specification: Impact Refresh WebSocket Protocol

## Overview

Real-time SCC metrics refresh via WebSocket, replacing HTTP polling.

## Requirements

### REQ-001: Remove Polling

**Given** a session detail page is loaded
**When** the page initializes
**Then** no automatic polling shall occur

### REQ-002: Manual Refresh

**Given** SCC metrics are displayed
**When** user clicks the refresh button
**Then** the system shall recalculate SCC metrics

### REQ-003: Stale Indicator

**Given** SCC metrics have been calculated
**When** files in the session workspace change
**Then** the UI shall display a stale indicator within 1 second

### REQ-004: Calculation State

**Given** a refresh is in progress
**When** user clicks refresh again
**Then** the duplicate request shall be ignored
**And** the UI shall indicate calculation is ongoing

### REQ-005: Multi-Client Sync

**Given** two clients are connected to the same session
**When** one client triggers a refresh
**Then** both clients shall receive the updated metrics

## WebSocket Protocol

### Message Types

#### Client → Server

##### refresh_impact

```json
{
  "type": "refresh_impact",
  "sessionId": "uuid-string"
}
```

Sent when user clicks refresh button.

#### Server → Client

##### impact_stale

```json
{
  "type": "impact_stale",
  "sessionId": "uuid-string",
  "stale": true
}
```

Sent when files change, invalidating cached metrics.

##### impact_calculating

```json
{
  "type": "impact_calculating",
  "sessionId": "uuid-string"
}
```

Sent when SCC calculation begins.

##### impact_updated

```json
{
  "type": "impact_updated",
  "sessionId": "uuid-string",
  "metrics": { /* ImpactMetrics */ },
  "stale": false
}
```

Sent when SCC calculation completes successfully.

##### impact_error

```json
{
  "type": "impact_error",
  "sessionId": "uuid-string",
  "error": "Error message"
}
```

Sent when SCC calculation fails.

## UI Specification

### Impact Buffer Header

```
┌─────────────────────────────────────────────────────┐
│ Impact                              [🔄 Refresh]   │
└─────────────────────────────────────────────────────┘
```

### Stale State

```
┌─────────────────────────────────────────────────────┐
│ Impact                [🔄 Refresh]    ⚠️ Outdated   │
└─────────────────────────────────────────────────────┘
```

### Calculating State

```
┌─────────────────────────────────────────────────────┐
│ Impact                [⏳ Analyzing...]               │
└─────────────────────────────────────────────────────┘
```

## Error Handling

| Error | UI Behavior |
|-------|-------------|
| SCC not installed | Show existing warning banner |
| SCC execution failed | Show error in Impact section |
| Timeout | Show "Calculation timed out" |

## Performance

- Stale notification latency: < 1 second
- Refresh button response: < 100ms
- SCC calculation timeout: 30 seconds
