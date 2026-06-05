## 1. VCS SSH command (domain core)

- [x] 1.1 Write failing tests for `buildGitSshCommand(keyPath?, clonePort?)`: key-only, port-only (no `-i`), key+port (`-p` appended), neither (today's string)
- [x] 1.2 Change `buildGitSshCommand` signature to `(keyPath?: string, clonePort?: number)` and append `-p <port>` when set; emit no `-i` when key absent
- [x] 1.3 Write failing tests: `cloneRepository` sets `GIT_SSH_COMMAND` with `-p` when port set but credential is non-SSH / absent
- [x] 1.4 Add `clonePort?: number` param to `cloneRepository`; build SSH env when `credential?.type === "ssh" || clonePort != null`; pass port to `buildGitSshCommand`
- [x] 1.5 Add `clonePort?: number` param to `pushUpstream` and `pushToRemote`; same gate + `buildGitSshCommand` change; cover with tests

## 2. Persistence + entities

- [x] 2.1 Add `clonePort?: number` to `Project` (`src/domain/projects/repository.ts`) with nullable column + read/write mapping; test round-trip
- [x] 2.2 Add `clonePort?: number` to `Session` (`src/domain/sessions/repository.ts`) with nullable column + read/write mapping; test round-trip

## 3. Service threading

- [x] 3.1 Add `clonePort?` to `CloneParams` and pass it from `clone()` into `cloneRepository` (`src/domain/projects/vcs-cache.ts`); test pass-through
- [x] 3.2 In `commits/service.ts` push, compute effective port `session.clonePort ?? project.clonePort` and pass to `pushUpstream` (both call sites ~337, ~408); test effective resolution

## 4. API boundary + validation

- [x] 4.1 Add `clonePort?` to `CreateSessionRequest` + `UpdateSessionRequest` (`src/api/rest/sessions/types.ts`) and persist it in the handlers
- [x] 4.2 Add `clonePort?` to project create/update request types + handlers (`src/api/rest/projects`)
- [x] 4.3 Add shared validation (integer, 1–65535) at the API/web boundary; reject invalid with a clear error; test accept/reject cases

## 5. Web UI

- [x] 5.1 Add numeric "SSH Port (optional)" input near `sourceBranch` in `ProjectCreatePage.tsx`
- [x] 5.2 Add optional "SSH Port" override input near `branchName` in `SessionCreatePage.tsx`
- [x] 5.3 Parse + validate `clonePort` in the session-create POST handler (`sessions.tsx`) and thread it into the clone params

## 6. Verification

- [x] 6.1 Run `cd packages/mimo-platform && bun test` (unit) and `bun run test.full` (integration); all green
- [ ] 6.2 End-to-end: create a project with SSH port 3022 against a custom-port repo, create a session, confirm clone and push succeed
