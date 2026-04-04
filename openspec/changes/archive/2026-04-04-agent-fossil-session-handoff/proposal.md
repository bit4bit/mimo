# Proposal: agent-fossil-session-handoff

## Why

The current implementation has a critical gap: when an agent connects, the platform sends `session_ready` with only `{sessionId, port}`, but the agent doesn't handle this message and lacks essential information to bootstrap sessions. The agent needs to receive checkout path (relative to its workdir), connect to fossil, clone/checkout, and spawn ACP processes. Currently, the checkout is created by the platform during session creation, but this is incorrect—the agent must create its own checkout from the fossil proxy. Additionally, `@agentclientprotocol/sdk` dependency is missing from mimo-agent despite being marked complete in tasks.

## What Changes

- **Platform sends enriched session_ready**: Include `platformUrl` for fossil clone, sessionId and port. Agent derives checkout path from `{workdir}/{sessionId}`.
- **Agent handles session_ready**: Parse message, clone from fossil proxy to `{workdir}/{sessionId}`, spawn ACP process per session
- **Agent handles session_ready**: Parse message, clone from fossil proxy to checkout directory, spawn ACP process per session
- **Remove checkout creation from session bootstrap**: Platform creates repo.fossil only; agent creates checkout via fossil clone
- **Add ACP SDK dependency**: Install `@agentclientprotocol/sdk` in mimo-agent
- **Multi-session agent support**: Agent maintains map of sessions with their checkouts, ACP processes, and file watchers
- **Relative checkout paths**: Agent receives paths relative to its workdir, enabling portable operation

## Capabilities

### New Capabilities
- `session-bootstrap`: Defines how agents receive session information and bootstrap their worktree by cloning from fossil proxy

### Modified Capabilities
- `agent-lifecycle`: Agent now handles `session_ready` message, maintains multi-session state, spawns ACP per session
- `session-management`: Session creation no longer creates checkout; only creates repo.fossil. Checkout creation moves to agent bootstrap phase.

## Impact

- **mimo-platform/src/index.tsx**: WebSocket handler sends enriched `session_ready` with checkout path and platform URL
- **mimo-platform/src/sessions/routes.tsx**: Remove `openFossilCheckout` call from session creation
- **mimo-platform/src/sessions/repository.ts**: Update path handling for relative paths
- **mimo-agent/package.json**: Add `@agentclientprotocol/sdk` dependency
- **mimo-agent/src/index.ts**: Add session management, `session_ready` handler, fossil clone logic, ACP process spawning per session
- **Message protocol**: `session_ready` message structure changes from `{sessionId, port}` to `{sessionId, port, checkoutPath, platformUrl}`