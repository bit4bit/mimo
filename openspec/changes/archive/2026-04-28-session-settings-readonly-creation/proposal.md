## Why

The session settings page currently focuses on runtime configuration (idle timeout) and ACP status, but it does not show the original setup choices made during session creation. Users cannot quickly verify what was configured for agent assignment, working subpath, local mirror, branch, and MCP attachments without inspecting underlying data.

## What Changes

- Add a read-only "Creation Settings" section to the session settings page.
- Display the same creation-time fields submitted from the session creation flow.
- Keep existing runtime controls (idle timeout update) unchanged.

## Capabilities

### Modified Capabilities

- `session-management`: Session settings page now includes read-only creation metadata.

## Impact

- `packages/mimo-platform/src/sessions/routes.tsx`: resolve and pass creation metadata display values.
- `packages/mimo-platform/src/components/SessionSettingsPage.tsx`: render read-only creation settings section.
- `packages/mimo-platform/test/sessions.test.ts`: add behavior tests for populated and fallback display values.
