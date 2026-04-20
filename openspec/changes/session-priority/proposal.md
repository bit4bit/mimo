## Why

Sessions in the list have no way to express urgency or importance. All sessions sort by creation date, so a critical session created last week sinks below a low-importance session created today. Users have no mechanism to surface what matters most.

## What Changes

- Add `priority` field to Session schema: `"high" | "medium" | "low"` (default `"medium"`)
- Session creation form includes optional priority selector (default Medium)
- Session settings page allows changing priority after creation
- Session list sorts by priority first (high → medium → low), then by `createdAt` descending as tiebreaker
- Session list displays priority as a column
- Existing sessions without `priority` field coerce to `"medium"` on read (backward compatible)

## Capabilities

### Modified Capabilities
- `session-management`: Sessions now carry a priority field. List ordering reflects priority before recency.

## Impact

- **Session schema**: Add `priority: "high" | "medium" | "low"` to Session interface
- **SessionRepository**: `CreateSessionInput` accepts optional `priority`; `UpdateSessionConfigInput` accepts `priority`; all list methods sort by priority then createdAt
- **API routes**: POST `/projects/:projectId/sessions` and PATCH `…/config` accept priority
- **UI: Session creation form**: Add priority selector (High / Medium / Low), default Medium
- **UI: Session settings page**: Add priority editor in editable settings section
- **UI: Session list page**: Add Priority column; update sort order
- **Backward compat**: Sessions missing `priority` on read → coerce to `"medium"`
- **Tests**: BDD integration tests for creation with priority, update changes sort order, missing field coerces
- **Dependencies**: None
- **Auth**: No changes
