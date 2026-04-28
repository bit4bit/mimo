## Why

Currently, users must manually trigger a commit after the agent finishes making changes. This creates friction and risks losing work if the user forgets to sync. By automatically committing and pushing when the agent finishes thinking, we ensure every completed agent task is preserved with minimal user intervention.

## What Changes

- **New**: AutoCommitService that listens for `thought_end` events from agents
- **New**: Automatic commit and push triggered when agent thinking completes
- **New**: Commit message generation with session name and file/line statistics
- **New**: Manual "Sync Now" button in session UI for explicit sync
- **Modified**: Session broadcast system to wire thought_end to auto-commit
- **Modified**: Session UI to show sync status and errors

## Capabilities

### New Capabilities

- `auto-commit`: Automatic commit and push on agent thought completion, with manual fallback

### Modified Capabilities

- None (implementation-only change, no spec-level behavior changes)

## Impact

- **Packages**: `mimo-platform` (new service, routes, UI)
- **Events**: Wires into existing `thought_end` session broadcast
- **Storage**: Reuses existing commit service and VCS layer
- **UI**: Adds sync status indicator and manual sync button to session page
