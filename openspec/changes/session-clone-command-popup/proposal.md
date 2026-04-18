## Why

Users need a fast, reliable way to clone the current session's agent workspace outside of MIMO. Today, they must manually reconstruct the Fossil URL and credentials, which is error-prone and slows onboarding and debugging workflows.

## What Changes

- Add a `Clone Workspace` action on the session page header, positioned next to the ACP status (`Agent ready` / `Agent sleeping`).
- Add a modal popup that shows a single, ready-to-run Fossil command for cloning and opening the current session workspace.
- Generate the command with authenticated session credentials embedded in the URL by default.
- Make the command clickable so it copies to clipboard with immediate success/failure feedback.
- Use the session name as `--workdir`, sanitizing only path separators (`/` and `\\`) to `-`.
- Provision a Fossil user named `dev` in each session repository at session creation time.
- Auto-generate and persist the `dev` password once per session at creation time.
- Grant `dev` full repository permissions for clone/open, sync, check-in, and admin operations.
- Add a migration script to backfill `dev` user + password for existing sessions that do not have them.
- Standardize command format to exactly one command:
  - `fossil open "<AUTH_URL>" --workdir "<SESSION_NAME>"`

## Capabilities

### New Capabilities
- `session-clone-command`: Provide a session-level UI action that displays and copies an authenticated Fossil open command for cloning the current agent workspace.

### Modified Capabilities
- `session-management`: Extend session provisioning to ensure every session has a persisted `dev` Fossil user credential pair and a migration path for older sessions.

## Impact

- Affected code:
  - `packages/mimo-platform/src/sessions/routes.tsx` (derive authenticated clone command for session detail render)
  - `packages/mimo-platform/src/sessions/repository.ts` (persist `dev` credentials in session data)
  - `packages/mimo-platform/src/vcs/index.ts` (create/update `dev` user with full permissions)
  - `packages/mimo-platform/src/components/SessionDetailPage.tsx` (button placement, clone modal markup)
  - `packages/mimo-platform/src/components/Layout.tsx` (load clone-modal client script)
  - `packages/mimo-platform/public/js/` (new script for modal open/close + clipboard copy)
  - `packages/mimo-platform/test/sessions.test.ts` (session page behavior assertions)
  - `packages/mimo-platform/scripts/` (new session credential backfill migration script)
- Security posture:
  - Credentials will be intentionally visible in the modal command by product decision for copy convenience.
- APIs/dependencies:
  - No external API changes; no new third-party dependencies expected.
