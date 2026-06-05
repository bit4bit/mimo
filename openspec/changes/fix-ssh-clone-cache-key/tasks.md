## 1. Failing test first (BDD)

- [x] 1.1 In the vcs-cache tests (`packages/mimo-platform/test/`), add a scenario: SSH credential + git project, run the cache `clone()` and assert the `command.run` call for `git clone --reference <cache> <repoUrl> <target>` receives `env.GIT_SSH_COMMAND` containing `-i <temp-key-path>`.
- [x] 1.2 Assert the temp key file is written with mode `0o600` and is unlinked after the cache clone completes.
- [x] 1.3 Add a negative case: HTTPS credential and no-credential clones do NOT set `env.GIT_SSH_COMMAND` on the `--reference` clone (no behavior change).
- [x] 1.4 Run the suite; confirm the new SSH cache-clone test FAILS against current code.

## 2. Extract shared SSH-env helper

- [x] 2.1 Add a private helper on `GitCacheEngine` (e.g. `withSshEnv(credential, repoUrl, projectId, fn)`) that, when `credential?.type === "ssh" && isSshUrl(repoUrl)`, writes `normalizePrivateKey(privateKey)` to `path.join(tempDir(), "mimo-cache-key-<projectId>-<Date.now()>")` with `mode 0o600` + `chmod 0o600`, builds `env = { GIT_SSH_COMMAND: buildGitSshCommand(keyPath) }`, calls `fn(env)`, and unlinks the temp key in a `finally`.
- [x] 2.2 Refactor `GitCacheEngine.refresh` to use the helper, preserving current behavior (existing refresh tests must stay green).

## 3. Fix cloneFromCache

- [x] 3.1 Wrap the `--reference` clone in `cloneFromCache` with the helper so `command.run` receives `{ env, timeoutMs: 300000 }` and the temp key is cleaned up on success and failure.
- [x] 3.2 Confirm the gate is `credential.type === "ssh" && isSshUrl(repoUrl)`, consistent with `refresh`.

## 4. Merge parent env into cache git spawn (Docker fix)

- [x] 4.1 Add a failing test: a cache git operation with `GIT_SSH_COMMAND` injected spawns git with an env that ALSO includes parent vars (e.g. `PATH`, `HOME`) — assert the `command.run` env is the merge `{ ...os.env.getAll(), GIT_SSH_COMMAND }`, not a bare `{ GIT_SSH_COMMAND }`.
- [x] 4.2 In `withSshEnv`, build `env = { ...this.os.env.getAll(), GIT_SSH_COMMAND: buildGitSshCommand(...) }`; leave the no-SSH path passing `undefined` (adapter inherits `process.env`).
- [x] 4.3 Confirm no regression: HTTPS / no-credential cache ops still pass `env: undefined` to `command.run`.

## 5. Thread clonePort through the cache

- [x] 5.1 Add a failing test: project with custom SSH port + scp-style URL → cache `refresh` and `cloneFromCache` set `GIT_SSH_COMMAND` containing `-p <port>`. Cover port-with-key, port-without-key (`-p`, no `-i`), and key-without-port (`-i`, no `-p`).
- [x] 5.2 Change cache `buildGitSshCommand(sshKeyPath: string | undefined, clonePort?: number)` to append `-p <port>` when set and `-i <key>` only when a key path is given.
- [x] 5.3 Add `clonePort?: number` to `RefreshParams`; pass `project.clonePort` from pre-warm (`handlers.ts:183-188`).
- [x] 5.4 Extend `withSshEnv` to accept `clonePort` and build env when `credential?.type === "ssh" || clonePort != null`; only create/clean the temp key when the credential is SSH. Thread `clonePort` from `refresh` (via `RefreshParams`) and `cloneFromCache` (via `CloneParams`).

## 6. Verify

- [x] 6.1 Run `cd packages/mimo-platform && bun test`; all vcs-cache, credential, and ssh-port tests pass, including the new env-merge and clonePort tests.
- [x] 6.2 Run the format/pre-commit command per `llms/commits.md` before committing.
- [x] 6.3 (Doc) Open question: whether `cloneRepository` (`vcs/index.ts:738`) should adopt the `&& isSshUrl(repoUrl)` gate for full three-path consistency — left for a follow-up. Optional hardening: adapter-side `{ ...process.env, ...options.env }` merge in `node-adapter.ts` — out of scope.
