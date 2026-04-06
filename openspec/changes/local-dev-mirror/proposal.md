## Why

When working with AI agents in mimo, users cannot directly test changes in their local development environment. They must commit and push to see the results, which slows down the feedback loop. Users need a way to have agent changes immediately reflected in a local directory where they can run tests, use their IDE, and verify behavior without going through the commit cycle.

## What Changes

- Add `defaultLocalDevMirrorPath` field to Project model - optional path that serves as default for all sessions
- Add `localDevMirrorPath` field to Session model - per-session override (can be empty to disable)
- Extend Project creation/edit forms with "Local Development Mirror" input field
- Extend Session creation form with pre-filled "Local Development Mirror" path (inherited from project, user can modify)
- Extend WebSocket `session_ready` message to include `localDevMirrorPath`
- Add file sync logic to mimo-agent: when files change in checkout, sync to mirror path (agent wins, skip .git/.fossil)
- File watcher triggers immediate sync - no delay, changes appear instantly in local dev directory

## Capabilities

### New Capabilities
- `local-dev-mirror`: Sync agent workspace changes to a user-specified local directory for immediate testing

### Modified Capabilities
- `agent-communication`: Extend `session_ready` WebSocket message to include `localDevMirrorPath` field

## Impact

- **mimo-platform**: Project repository (new field), Session repository (new field), Project forms, Session forms, WebSocket handlers
- **mimo-agent**: Session manager (sync logic), file watcher extension
- **User experience**: Faster feedback loop, ability to test agent changes immediately in local environment
- **Storage**: Additional path fields in YAML files, no additional storage overhead
