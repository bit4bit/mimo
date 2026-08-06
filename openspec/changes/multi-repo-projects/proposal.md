## Why

Users increasingly work across multiple connected repositories at the same time, but the platform currently models each project and session as exactly one repository. This change makes multi-repository work a first-class workflow so related changes can be developed, reviewed, and committed together without forcing a synthetic monorepo.

## What Changes

- **BREAKING** Replace single-repository project fields (`repoUrl`, `credentialId`, branch/subpath scalar fields) with a project `repositories[]` list.
- Add repository management to project create/edit flows: repository URL, credential, branch, mount path, and primary/default repository.
- Add explicit repository mount deployment into the session agent workspace, so `agent-workspace` is a container of repository checkouts rather than the root of one clone.
- Allow session creation to specify a workspace-relative directory for the agent working directory.
- Introduce repo-qualified file identity (`repoId + path`) across sync, patches, edit/review, commit, and impact flows.
- Update commit view to aggregate changes across repositories and commit the same message on a best-effort basis per repository.
- Show per-repository commit results, including success, skipped, and failed states, with retry/force-push recovery.
- Update file tree and impact buffers to select a repository or show aggregate impact.
- Provide a migration script to convert existing single-repo projects/sessions to the multi-repo schema without keeping a runtime legacy compatibility layer.

## Capabilities

### New Capabilities

- `multi-repo-projects`: Multi-repository project and session modeling, mounted workspace deployment, repo-qualified file operations, and best-effort cross-repo commit behavior.

### Modified Capabilities

- `projects`: Project repository configuration changes from one repo to `repositories[]` with mount paths and per-repo credentials.
- `session-management`: Session creation/deployment changes to materialize multiple repositories and carry per-repo session state.
- `session-agent-subpath`: Relative directory behavior changes from single-repo subpath to workspace-relative directory with repo resolution.
- `project-vcs-cache`: VCS cache changes from one cached repo per project to one cached repo per project repository.
- `file-sync`: Changed-file detection and sync state become repo-qualified across multiple upstream/workspace pairs.
- `commit-buffer`: Commit preview/apply becomes aggregated across repositories with per-repo results.
- `review-buffer`: Review diffs become repo-qualified.
- `patch-buffer`: Patch generation/application becomes repo-qualified.
- `impact-tracking`: Impact calculation supports repository selection and aggregate views.
- `auto-commit`: Auto-sync/auto-commit behavior runs per repository and reports partial failures.

## Impact

- Project/session domain models, YAML persistence, REST API schemas, and web forms.
- Session bootstrap and agent workspace clone/deployment flow.
- Agent session readiness payload and checkout layout expectations.
- Git HTTP serving/routing for multiple per-session repositories.
- VCS cache, clone, pull, patch, review, commit, push, and force-push paths.
- File tree, impact buffer, commit buffer, patch buffer, review buffer, and related public JS clients.
- Migration tooling for existing project/session data.
