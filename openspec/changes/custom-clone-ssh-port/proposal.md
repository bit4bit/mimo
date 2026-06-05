## Why

Some Git remotes listen on a non-standard SSH port (e.g. 3022). Git's scp-like
URLs (`git@host:path`) cannot carry a port, so clone and push silently use port
22 and fail. Users need a way to set the SSH port manually so it can be passed
as `-p <port>` to the underlying `ssh` invocation.

## What Changes

- Add an optional, manually-entered **SSH port** to projects (default for the
  repo) and to sessions (per-session override). Effective port =
  `session.clonePort ?? project.clonePort`.
- When a port is set, inject `-p <port>` into the `GIT_SSH_COMMAND` used for git
  clone and git push, even when authentication is HTTPS or relies on default
  SSH keys (today the SSH command is only built for stored SSH-key credentials).
- Surface the field in the project-create and session-create forms as a numeric
  input, and accept it on the corresponding create/update API requests.
- Validate the port as an integer in range 1–65535; reject out-of-range or
  non-integer values with a clear error.
- No auto-parsing of `ssh://host:port/...` URLs — the port is set manually only.

## Capabilities

### New Capabilities
- `vcs-ssh-port`: Manually-configured custom SSH port for a repository's Git
  remote — stored as a project default with a per-session override, validated
  (1–65535), and injected as `-p <port>` into clone and push SSH commands.

### Modified Capabilities
- `vcs-integration`: Git clone and Git push honor the effective configured SSH
  port when present.

## Impact

- Domain: `src/domain/vcs/index.ts` (`buildGitSshCommand`, `cloneRepository`,
  `pushUpstream`, `pushToRemote`), `src/domain/projects/repository.ts`,
  `src/domain/sessions/repository.ts`, `src/domain/projects/vcs-cache.ts`
  (`CloneParams`, `clone`), `src/domain/commits/service.ts` (effective-port
  computation at push).
- API: `src/api/rest/sessions/types.ts` (`CreateSessionRequest`,
  `UpdateSessionRequest`) and the projects create/update request types/handlers.
- Web: `ProjectCreatePage.tsx`, `SessionCreatePage.tsx`, and the session-create
  POST handler in `sessions.tsx` (parse + validate).
- No new dependencies. Persistence adds one nullable integer column per
  project/session record.
