## Why

When working with monorepos, the agent always starts at the repository root, making it unaware of which package or service is the focus of the session. Adding an optional subpath lets users scope the agent's starting directory to the relevant part of the repo.

## What Changes

- Add optional `agentSubpath` field to the `Session` data model (persisted in `session.yaml`)
- Add optional "Agent working directory" text input to the session creation form
- Include `agentSubpath` in the `session_ready` WebSocket message from platform to agent
- Agent passes `join(checkoutPath, agentSubpath)` as `cwd` to `acpClient.initialize()` when subpath is set

## Capabilities

### New Capabilities

- `session-agent-subpath`: Optional subpath field on a session that scopes the agent's initial working directory to a subdirectory of the checkout

### Modified Capabilities

- `session-management`: Session creation now accepts an optional `agentSubpath` field

## Impact

- `packages/mimo-platform/src/sessions/repository.ts` — add `agentSubpath?: string` to `Session` interface and YAML persistence
- `packages/mimo-platform/src/sessions/routes.tsx` — read `agentSubpath` from form body, pass to `repository.create()`
- `packages/mimo-platform/src/components/SessionCreatePage.tsx` — add optional text input for subpath
- `packages/mimo-platform/src/index.tsx` — include `agentSubpath` in `session_ready` message
- `packages/mimo-agent/src/index.ts` — use `join(checkoutPath, agentSubpath ?? "")` as ACP cwd
