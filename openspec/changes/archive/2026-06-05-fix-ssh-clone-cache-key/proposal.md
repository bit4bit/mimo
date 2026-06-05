## Why

The project-level VCS cache path does not honor the same SSH settings as a direct clone, so cloning over SSH fails in environments without an authorized ambient key (notably inside Docker), even though it works on a host that happens to have a matching `~/.ssh` key. Three distinct gaps cause this:

1. The cache-backed clone (`git clone --reference <cache> <repoUrl> <target>`) ran with no `GIT_SSH_COMMAND`, so the credential's private key was never used — git fell back to ambient SSH identities (ssh-agent, `~/.ssh/id_*`).
2. The cache spawns git with a bare `{ GIT_SSH_COMMAND }` env, which the OS adapter passes straight to `spawn` — **replacing** the child environment and stripping `PATH`/`HOME`/`SSH_AUTH_SOCK`. The injected `ssh` then cannot run correctly in a minimal container.
3. The cache path never threads `clonePort`: `buildGitSshCommand` takes no port, `RefreshParams` has no `clonePort` field, and `cloneFromCache` ignores `params.clonePort`. A custom SSH port (scp-style `git@host:path` URL) is silently dropped and the cache connects to port 22.

## What Changes

- `GitCacheEngine.cloneFromCache` (`packages/mimo-platform/src/domain/projects/vcs-cache.ts`) injects the SSH private key via `GIT_SSH_COMMAND` for the cache-backed clone, mirroring `GitCacheEngine.refresh`: write the normalized key to a temp `0600` file, set `env.GIT_SSH_COMMAND`, pass `env` to `command.run`, and delete the temp key in a `finally` block.
- The cache builds the spawn env by **merging** the parent environment with the injected command, i.e. `{ ...os.env.getAll(), GIT_SSH_COMMAND }`, matching how `vcs/index.ts` `execCommand` already does it, so `PATH`/`HOME`/`SSH_AUTH_SOCK` survive into the git subprocess.
- The cache threads the SSH port end-to-end: `buildGitSshCommand` accepts a `clonePort` and appends `-p <port>`; `RefreshParams` gains `clonePort`; pre-warm passes `project.clonePort`; `refresh` and `cloneFromCache` build a port-aware SSH command. The build-command gate widens to `credential.type === "ssh" || clonePort != null` (port may be needed without a credential), while key injection stays conditional on the SSH credential.
- Align the SSH-key gate so the clone paths agree (`cloneRepository`, `refresh`, `cloneFromCache`).
- No behavior change for HTTPS credentials or for repositories without credentials/port.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `vcs-credentials`: the "SSH credential injection via GIT_SSH_COMMAND" requirement is extended to cover the cache-backed clone (which still contacts the remote and must inject the key) and to require the cache git subprocess inherit the parent environment so the injected `ssh` runs.
- `vcs-ssh-port`: the "SSH port injected into Git SSH command" requirement is extended so a configured SSH port is honored by the cache `refresh` and cache-backed clone, not just direct clones.

## Impact

- Code: `packages/mimo-platform/src/domain/projects/vcs-cache.ts` (`buildGitSshCommand`, `withSshEnv`, `RefreshParams`, `refresh`, `cloneFromCache`); `packages/mimo-platform/src/api/rest/projects/handlers.ts` (pre-warm passes `project.clonePort`).
- Tests: cache tests assert the `--bare` and `--reference` clones receive `env.GIT_SSH_COMMAND` containing the temp key path and `-p <port>`, and that the spawn env includes inherited parent vars.
- No API or dependency changes. Behavior shift only for SSH cache operations that previously dropped the key, env, or port — previously broken in Docker / custom-port setups, now correct.
