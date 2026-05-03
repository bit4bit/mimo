# Proposal: Add Force Push Button to Session Detail

## Why

When the commit succeeds but push fails (e.g., non-fast-forward rejection), the user is stranded. The commit dialog closes, workspace changes are gone from preview, and there's no UI path to retry the push. A server restart makes the situation worse—the yellow warning disappears and the user has no way to know there are unpushed commits.

## What Changes

- Add a "Force Push to Upstream" button on the session detail page
- Button pushes whatever is already committed in `upstream/` with `--force`
- Available regardless of workspace state (survives restarts)
- Shows confirmation dialog before destructive operation
- Displays success/failure feedback inline

## Capabilities

### New Capabilities
- `force-push`: manual force-push of upstream commits from session UI

### Modified Capabilities
- `session-management`: adds force-push action to session detail page

## Impact

- **Frontend**: `SessionDetailPage.tsx` adds force-push button + confirmation dialog
- **Backend routes**: `commits.ts` adds `POST /commits/:sessionId/push-force` endpoint
- **VCS layer**: `VCS.pushUpstream()` gains optional `force` parameter
- **Testing**: unit tests for force push endpoint and VCS behavior
