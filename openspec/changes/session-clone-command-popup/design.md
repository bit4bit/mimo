## Context

The session detail UI already renders session metadata (status, assigned agent, Fossil timeline link) and supports modal interactions (commit dialog). Session bootstrap already uses per-session Fossil credentials (`agentWorkspaceUser`, `agentWorkspacePassword`) and stores them in session state. The platform can derive a shared Fossil URL for each session via `sharedFossilServer.getUrl(sessionId)`.

Users currently need to manually construct a clone/open command from separate bits of data (URL, credentials, target folder). This is slow and error-prone for first-time setup, debugging, and handoff workflows. The requested behavior is a one-command Fossil flow shown directly in the session page, with credentials visible by default and copy-to-clipboard support.

In addition, session repositories need a consistent cloning identity: a Fossil user named `dev` with full permissions, password auto-generated once during session creation, and persisted in session metadata. Existing sessions must be backfilled via migration.

Constraints:
- Keep command format to exactly one command: `fossil open "<AUTH_URL>" --workdir "<SESSION_NAME>"`.
- Place the action button next to the ACP status indicator in the session header.
- Use session name for `--workdir`, sanitizing only path separators (`/`, `\\`) to `-`.
- Standardize session clone identity to username `dev`.

## Goals / Non-Goals

**Goals:**
- Provide a discoverable `Clone Workspace` action in session detail.
- Render a modal with a ready-to-run authenticated command.
- Support single-click copy of the command with immediate UI feedback.
- Derive command server-side so the UI receives a stable, prebuilt value.
- Ensure every session has a persisted password for Fossil user `dev`.
- Provide an idempotent migration to backfill `dev` user/password for existing sessions.

**Non-Goals:**
- Rotating or masking credentials in this flow.
- Changing agent bootstrap clone behavior.
- Supporting multiple command variants (Git, SSH, multi-step shell scripts).
- Adding new credential management endpoints.
- Rotating all existing session passwords during migration.

## Decisions

1. **Derive authenticated command in route layer**
   - **Decision:** Build command in `sessions/routes.tsx` and pass it as a prop to `SessionDetailPage`.
   - **Rationale:** Keeps credential and URL assembly logic centralized with existing session data lookup, avoids duplicating URL manipulation in frontend JS, and makes tests deterministic at render time.
   - **Alternatives considered:**
     - Build command in browser from separate fields: rejected because it exposes more assembly logic client-side and increases divergence risk.
     - Fetch command from a dedicated endpoint: rejected as unnecessary request/complexity for static session-page data.

2. **Use a dedicated modal + script for clone command interactions**
   - **Decision:** Add a new clone modal in `SessionDetailPage` and a small dedicated client script (loaded via `Layout`) for open/close/copy behavior.
   - **Rationale:** Mirrors existing commit-modal pattern, keeps behavior isolated, and avoids coupling clone behavior into unrelated scripts.
   - **Alternatives considered:**
     - Inline script block in JSX: rejected for maintainability and consistency with existing public JS assets.
     - Reusing commit.js: rejected to avoid cross-feature coupling.

3. **Command shape and folder naming**
   - **Decision:** Always emit `fossil open "<AUTH_URL>" --workdir "<SESSION_NAME>"`.
   - **Rationale:** Meets user requirement for one command and lets Fossil handle clone + checkout in one operation.
   - **Alternatives considered:**
     - `fossil clone` + `fossil open`: rejected due to multi-command requirement.
     - Include `--repodir`: rejected based on user decision to rely on current directory default.

4. **Credential visibility by product decision**
   - **Decision:** Display full command with embedded credentials by default.
   - **Rationale:** Explicit user preference prioritizes copy convenience and reduced friction.
   - **Alternatives considered:**
     - Mask/reveal workflow: rejected by user.

5. **Canonical workspace user is `dev` per session**
   - **Decision:** Use a fixed Fossil username `dev` for session cloning and workspace operations; generate a unique password per session at creation and persist it.
   - **Rationale:** Simplifies UX (single known username) while retaining per-session secret isolation.
   - **Alternatives considered:**
     - Keep random username per session (`agent-xxxx`): rejected because it adds copy friction and discoverability issues.
     - Shared global `dev` password across sessions: rejected for weak isolation and high blast radius.

6. **Backfill via idempotent migration script**
   - **Decision:** Add a script that scans sessions and only creates/persists missing `dev` credentials.
   - **Rationale:** Enables safe rollout without forcing recreation of sessions and allows repeated runs in CI/dev until complete.
   - **Alternatives considered:**
     - Lazy backfill on session page open: rejected because provisioning side effects in UI path are harder to reason about.
     - One-shot destructive rewrite: rejected due to recoverability and operational risk.

## Risks / Trade-offs

- **[Credential exposure in UI]** Visible credentials can be copied from page source/screenshots/browser tooling. → **Mitigation:** Limit access to authenticated session owner and keep command only on session detail route (no public endpoint).
- **[Session name path edge cases]** Raw session names can create nested paths or shell issues. → **Mitigation:** Replace only `/` and `\\` with `-` and always quote session name in command string.
- **[Clipboard API availability]** Some browsers or contexts may block clipboard writes. → **Mitigation:** Provide explicit failure feedback and keep command text selectable for manual copy.
- **[Button placement crowding]** Header can become crowded on narrow screens. → **Mitigation:** Use existing compact button styles and allow wrapping/flexible layout where needed.
- **[Over-privileged `dev` account]** Full permissions increase impact if leaked. → **Mitigation:** Keep passwords per-session, generated randomly, and owner-scoped in session views.
- **[Migration partial failures]** Some sessions may fail user creation due to missing/corrupt repo files. → **Mitigation:** Make migration report per-session outcomes, skip safely, and remain rerunnable.

## Migration Plan

1. Add server-side command derivation to session detail route output.
2. Add clone button and modal markup/styles to session detail component.
3. Add `session-clone.js` and load it in `Layout` for session pages.
4. Update session creation provisioning to create Fossil user `dev` with full permissions and persist generated password.
5. Add an idempotent migration script for sessions missing `dev` credentials and/or user creation.
6. Add/adjust tests for session detail render, command content, creation provisioning, and migration behavior.
7. Verify behavior manually on desktop/mobile widths and with session names containing spaces/slashes.

Rollback strategy:
- Revert the new command props and modal/button/script include. Existing session page behavior remains intact because clone flow is additive.

## Open Questions

- Define the exact "full permissions" capability set for Fossil user provisioning in code (for example `s`/setup + `a`/admin + `i`/check-in + `o`/check-out + related capabilities) and validate against Fossil CLI behavior.
