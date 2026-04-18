## 1. Session clone command UI

- [ ] 1.1 Extend session detail route data to derive and pass authenticated clone command (`fossil open "<AUTH_URL>" --workdir "<SESSION_NAME>"`) using session credentials and sanitized session name.
- [ ] 1.2 Add `Clone Workspace` action in session header adjacent to ACP status and add clone command modal markup in `SessionDetailPage`.
- [ ] 1.3 Add client-side modal/copy behavior script (`session-clone.js`) with open/close controls, clipboard copy, and success/failure feedback.
- [ ] 1.4 Load clone modal script from `Layout` for session pages and ensure style/DOM hooks align with existing modal conventions.

## 2. Session provisioning for `dev` user

- [ ] 2.1 Update session creation flow to always provision Fossil user `dev` with generated password and persist `agentWorkspaceUser`/`agentWorkspacePassword` in session data.
- [ ] 2.2 Update Fossil user provisioning utility to grant the agreed full-permissions capability set for `dev` and handle create-or-update behavior safely.
- [ ] 2.3 Ensure session_ready payloads and clone command generation use persisted `dev` credentials consistently across initial bootstrap and reconnect paths.

## 3. Backfill migration for existing sessions

- [ ] 3.1 Add migration script under platform scripts to scan existing sessions and detect missing/invalid `dev` workspace credentials.
- [ ] 3.2 Implement idempotent backfill logic that creates or repairs Fossil `dev` user and writes missing password/session fields without duplicating valid data.
- [ ] 3.3 Add migration reporting output per session (`updated`, `skipped`, `failed`) and non-zero exit behavior only for hard failures.

## 4. Verification and test coverage

- [ ] 4.1 Add/extend platform session page tests to verify clone button placement, modal rendering, and command format/content (including authenticated URL + sanitized session-name workdir).
- [ ] 4.2 Add/extend session creation tests to verify `dev` credential persistence and Fossil user provisioning path.
- [ ] 4.3 Add migration tests (or script-level integration checks) to verify backfill correctness and idempotency across repeated runs.
- [ ] 4.4 Run relevant mimo-platform and mimo-agent test suites and fix regressions before implementation handoff.
