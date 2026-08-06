## 1. Multi-Repo Domain Model And Migration

- [x] 1.1 Write failing integration tests for project schema v2 with `repositories[]`, mount path validation, and per-repo credential validation
- [x] 1.2 Implement project repository model, persistence, REST schemas, and validation for `repositories[]`
- [x] 1.3 Write failing integration tests for session schema v2 with per-repo `upstreamPath`, `workspacePath`, `branch`, and `baseline`
- [x] 1.4 Implement session repository state model and persistence for multi-repo sessions
- [x] 1.5 Write failing migration tests covering project/session conversion, backup, validation, and idempotency
- [x] 1.6 Implement the single-repo to multi-repo migration script

## 2. Repository Cache And Session Deployment

- [x] 2.1 Write failing integration tests for per-project-repository VCS cache paths, refresh, clone, and cleanup
- [x] 2.2 Implement per-repository cache storage and credential-aware clone/fetch operations
- [x] 2.3 Write failing integration tests for session creation deploying all project repositories into mounted upstream/workspace paths
- [x] 2.4 Implement multi-repo session bootstrap, including per-repo branch setup, seeding, baselines, and workspace checkout creation
- [x] 2.5 Write failing tests for workspace-relative session directory validation and repo resolution by longest mountPath
- [x] 2.6 Implement workspace-relative `relativeDir` handling through session creation and `session_ready`

## 3. Agent Workspace And Git Serving

- [x] 3.1 Write failing tests for agent session payload containing multiple repository clone URLs/checkouts
- [x] 3.2 Implement agent-side multi-repository checkout handling and ACP cwd resolution
- [x] 3.3 Write failing tests for git HTTP routing by session and repository
- [x] 3.4 Implement per-session/per-repository bare repo serving and credential verification
- [x] 3.5 Centralize HTTPS/SSH credential injection for clone, fetch, push, and force-push operations

## 4. Repo-Qualified Sync, Files, And Patches

- [x] 4.1 Write failing integration tests for repo-qualified changed-file detection across all session repositories
- [x] 4.2 Implement repo-qualified file identity types and longest-mountPath resolution
- [x] 4.3 Update file sync service, websocket messages, changed-files cache, and REST payloads to use `{ repoId, path }`
- [x] 4.4 Write failing tests for patch create/list/approve/delete with same path in multiple repositories
- [x] 4.5 Implement repo-qualified patch storage, patch buffer API, and patch application

## 5. Commit, Review, And Auto-Commit

- [x] 5.1 Write failing integration tests for aggregated commit preview across repositories
- [x] 5.2 Implement per-repo commit preview, diff range calculation, and baseline advancement
- [x] 5.3 Write failing integration tests for best-effort commit-and-push with per-repo success/skipped/failed results
- [x] 5.4 Implement best-effort commit-and-push fan-out with retry and per-repo force-push recovery
- [x] 5.5 Write failing tests for repo-qualified review file lists and per-file diffs
- [x] 5.6 Implement review endpoints and buffer data flow for repository selection and aggregate review
- [x] 5.7 Write failing tests for auto-commit across multiple repositories with partial failure reporting
- [x] 5.8 Implement auto-commit/manual sync per-repository execution and sync-status results

## 6. UI Buffers And Project Management

- [x] 6.1 Write failing UI/integration tests for project create/edit forms managing multiple repositories and credentials
- [x] 6.2 Implement project repository list editor with mount path, branch, credential, and primary repository controls
- [x] 6.3 Write failing UI/integration tests for session creation with workspace-relative directory selection
- [x] 6.4 Implement session creation relative directory input and validation display
- [x] 6.5 Write failing UI tests for file tree repository selector and repo-qualified file rows
- [x] 6.6 Implement file tree repository selector and repo-qualified file actions
- [x] 6.7 Write failing UI tests for impact buffer repository selection and aggregate metrics
- [x] 6.8 Implement impact buffer repository selector, per-repo metrics, and aggregate view
- [x] 6.9 Write failing UI tests for commit buffer grouped cross-repo changes and per-repo failure actions
- [x] 6.10 Implement commit buffer grouping, per-repo status display, retry, and force-push actions

## 7. Cleanup And Verification

- [x] 7.1 Remove legacy single-repo runtime branches after migration path is covered by tests
- [x] 7.2 Update docs and keybinding/help references affected by multi-repo buffers
- [x] 7.3 Run package unit tests and full test suites for `mimo-platform` and `mimo-agent`
- [x] 7.4 Run OpenSpec verification for `multi-repo-projects` and resolve any spec/task drift
