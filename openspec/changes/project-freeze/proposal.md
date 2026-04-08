## Why

When external changes are pushed to a project's upstream repository, existing sessions become stale. Users need a way to mark all sessions as frozen to prevent accidental edits on outdated state. Currently, there's no mechanism to lock sessions when the external repository has moved forward.

## What Changes

- Add `frozen` status to session status enum (`active | paused | closed` → `active | paused | closed | frozen`)
- Create new project action "Freeze Project" that marks all sessions as `frozen`
- Add "Freeze Project" button to Project Detail page (Actions section, next to Delete)
- Block chat message sending for frozen sessions
- Block commit operations for frozen sessions
- Display `frozen` status in sessions list (no badge/icon, just text)

## Capabilities

### New Capabilities
- `session-freeze`: Session status management with frozen state and project-level freeze action

### Modified Capabilities
- None (existing session behavior remains unchanged, just adding new status value)

## Impact

- Session repository: new `frozen` status value
- Project Detail UI: new button and action
- Session routes: validation to block messages/commits for frozen sessions
- Session list UI: display frozen status
