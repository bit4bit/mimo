## Context

Session creation for a Git project uses `createProjectVcsCache().clone()` (`packages/mimo-platform/src/domain/projects/vcs-cache.ts`). It runs two git operations:

1. `GitCacheEngine.refresh()` — `git clone --bare <repoUrl> <cache>` (or `git fetch --all`). Already builds a temp SSH key file and sets `GIT_SSH_COMMAND` when the credential is SSH. Correct.
2. `GitCacheEngine.cloneFromCache()` — `git clone --reference <cache> <repoUrl> <target>`. Runs `command.run(args, { timeoutMs })` with **no `env`**. The credential is ignored.

`git clone --reference` borrows objects from the local bare cache but the clone source is still the remote `<repoUrl>`; git contacts that remote to negotiate refs, so the step authenticates over SSH. With no `GIT_SSH_COMMAND`, git uses ambient identities (ssh-agent, `~/.ssh/id_*`, `~/.ssh/config`). The assigned credential key is never used.

The same correct injection already exists in two places to copy from: `GitCacheEngine.refresh()` (`vcs-cache.ts:167-186`, cleanup `248-252`) and `VCSManager.cloneRepository` (`vcs/index.ts:736-748`). Helpers `buildGitSshCommand`, `normalizePrivateKey`, `isSshUrl` are already module-local in `vcs-cache.ts`.

## Goals / Non-Goals

**Goals:**

- `cloneFromCache` authenticates to the remote with the credential's private key, not ambient SSH identities.
- Reuse the existing temp-key + `GIT_SSH_COMMAND` + `finally`-cleanup pattern from `refresh`.
- A BDD test asserts the `--reference` clone receives `env.GIT_SSH_COMMAND` containing the temp key path.

**Non-Goals:**

- No change to HTTPS credential handling or no-credential clones.
- No redesign of the cache flow (not switching to "clone from local cache, set remote after" — see Decisions).
- No change to `refresh` or `cloneRepository` behavior beyond gate alignment.

## Decisions

### Decision: Inject GIT_SSH_COMMAND in cloneFromCache (Option 1), mirroring refresh

Add, inside `cloneFromCache`, before building the clone args:

- If `params.credential?.type === "ssh" && isSshUrl(params.repoUrl)`: write `normalizePrivateKey(privateKey)` to `path.join(tempDir(), "mimo-cache-key-<projectId>-<Date.now()>")` with `mode 0o600`, `chmod 0o600`, and set `env = { GIT_SSH_COMMAND: buildGitSshCommand(sshKeyPath) }`.
- Pass `env` into `command.run(args, { env, timeoutMs: 300000 })`.
- Wrap the run in `try { ... } finally { if (sshKeyPath && exists) unlink(sshKeyPath); }`.

**Why:** Smallest diff, byte-for-byte consistent with `refresh`, lowest risk. The injection block is identical to one already proven in the same file.

**Alternative considered — clone from the local cache then `git remote set-url origin <repoUrl>`:** would avoid the remote hit (no credential needed at this step) and is arguably cleaner, but changes remote-setup semantics and `--reference` behavior. Higher risk for a bugfix; rejected for this change.

### Decision: Extract a shared SSH-env helper to avoid duplication

`refresh` and `cloneFromCache` would now contain the same key-write/env/cleanup block. Extract a private helper on `GitCacheEngine`, e.g. `withSshEnv(credential, repoUrl, projectId, fn)` that creates the temp key, invokes `fn(env)`, and cleans up in `finally`. Both methods call it. Keeps DI/purity rules (no hidden globals) and removes the copy-paste.

**Why:** Repo rules require minimal, clear changes and discourage duplication; a single helper makes the two paths provably consistent.

### Decision: Merge the parent environment when spawning cache git commands

`NodeCommandRunner.run`/`runSync` (`src/infrastructure/os/node-adapter.ts:59-63, 105-111`) pass `env: options.env` straight to `spawn`, which **replaces** the child environment. A bare `{ GIT_SSH_COMMAND }` therefore strips `PATH`/`HOME`/`SSH_AUTH_SOCK` from the git subprocess, breaking the injected `ssh` in minimal containers. The direct-clone path never hits this because `vcs/index.ts` `execCommand:100` pre-merges: `env ? { ...this.os.env.getAll(), ...env } : undefined`.

`withSshEnv` builds the env as `{ ...this.os.env.getAll(), GIT_SSH_COMMAND: ... }`, matching the existing idiom. When no SSH env is needed it keeps passing `undefined` (so the adapter inherits `process.env` by default — unchanged).

**Why caller-side merge, not adapter-side:** the codebase convention is that callers merge via `os.env.getAll()` before `command.run`; `execCommand` already does. Fixing the one caller that forgot keeps adapter semantics intact and avoids double-merging or surprising every other `command.run` caller. Adapter-side `{ ...process.env, ...options.env }` is noted as optional hardening, out of scope here.

### Decision: Thread clonePort through the cache path

`clonePort` is fully plumbed for direct clones (`vcs/index.ts:151` appends `-p <port>`) but dropped by the cache: cache `buildGitSshCommand` takes no port, `RefreshParams` has no `clonePort`, and `cloneFromCache` ignores `params.clonePort` (only forwarded to the fallback `cloneRepository`). Result: scp-style `git@host:path` URLs with a custom port connect to port 22 in the cache and only work after the cache fails into the fallback.

Changes: `buildGitSshCommand(sshKeyPath: string | undefined, clonePort?: number)` appends `-p <port>` when set; `RefreshParams` gains `clonePort`; pre-warm (`handlers.ts:183-188`) passes `project.clonePort`; `withSshEnv` accepts and forwards the port so both `refresh` and `cloneFromCache` build a port-aware command. The build gate widens to `credential?.type === "ssh" || clonePort != null` so a port without a credential still produces `-p`; the temp-key write stays gated on the SSH credential only (no key file when there is no credential).

**Note on key-only vs port-only:** `buildGitSshCommand` must emit `-p` without `-i` (port, no credential) and `-i` without `-p` (credential, no port), matching the `vcs-ssh-port` scenarios. `withSshEnv` therefore builds env when EITHER is present, but only creates/cleans a temp key file when the credential is SSH.

### Decision: Align the SSH gate across the three paths

`refresh` and `cloneFromCache` gate on `credential.type === "ssh" && isSshUrl(repoUrl)`; `cloneRepository` (`vcs/index.ts:738`) gates only on `credential.type === "ssh"`. Standardize on `credential.type === "ssh" && isSshUrl(repoUrl)` for the cache paths (the cache only handles git remotes reachable via the stored URL form). The shared helper enforces one rule in one place for both cache methods. `cloneRepository` is left as-is unless a follow-up aligns it; note the discrepancy in tasks.

## Risks / Trade-offs

- **Temp key on disk during the cache clone** → mitigated by `0o600` + `finally` unlink, identical to existing `refresh` handling.
- **Gate uses `isSshUrl`; an SSH credential paired with a non-`git@`/`ssh://` URL would still skip the key** → acceptable: such a pairing is a credential/URL-type mismatch already rejected by the "Credential type must match repository URL type" requirement. Documented, not silently widened.
- **Helper extraction touches `refresh`** → covered by existing refresh tests plus the new cloneFromCache test; behavior is unchanged for refresh.

## Migration Plan

Pure bugfix, no data/schema/API migration. Deploy normally. Rollback = revert the commit; prior behavior (broken on hosts without a matching ambient key) is restored.

## Open Questions

- Should `cloneRepository` (`vcs/index.ts:738`) also adopt the `&& isSshUrl(repoUrl)` gate for full three-path consistency, or is its credential-type-only gate intentional? Left out of scope; flagged for a follow-up.
