## Why

Creating a chat thread without an assigned agent leads to threads that cannot execute agent-backed actions and fail later in the workflow. Requiring an agent at thread creation prevents invalid thread setup and gives users immediate, explicit ownership of each thread.

## What Changes

- Require `assignedAgentId` when creating a chat thread via `POST /sessions/:id/chat-threads`.
- Reject thread creation requests that omit `assignedAgentId` or provide an empty value.
- Update the create-thread dialog so agent selection is mandatory and no longer offers a "None" option.
- Update thread creation tests to reflect the new validation behavior.

## Capabilities

### New Capabilities
- `chat-thread-management`: Defines thread creation rules, including required agent assignment.

### Modified Capabilities
- None.

## Impact

- Affected backend route: `packages/mimo-platform/src/sessions/routes.tsx`
- Affected browser UI: `packages/mimo-platform/public/js/chat-threads.js`
- Affected tests: `packages/mimo-platform/test/chat-threads.test.ts`
- API behavior change for clients that previously created threads without `assignedAgentId`
