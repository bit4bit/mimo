## 1. Failing Tests First (BDD)

- [x] 1.1 Add failing POST tests in `packages/mimo-platform/test/` for per-repo fields: `branchMode_<repoId>=sync` + `branchName_<repoId>` clones that branch directly and skips `createBranch` for that repo only
- [x] 1.2 Add failing POST test for mixed modes: repo A `new` (clone `sourceBranch` + `createBranch`), repo B `sync` (direct clone, no `createBranch`); each repo's persisted `branch` matches its own resolved name
- [x] 1.3 Add failing validation tests: per-repo sync with empty branch name → 400 naming the repo; per-repo sync on fossil repo → 400 naming the repo; sync clone failure → 500 naming the repo and session deleted
- [x] 1.4 Add failing back-compat tests: flat `branchName`/`branchMode` without suffixed fields applies to all repos; omitted mode = `new`; suffixed field wins over flat for the same repo while flat still applies to others; empty name in `new` mode falls back to the repository's configured `newBranch` (no branch created when unset)
- [x] 1.5 Add failing rendered-HTML tests: one branch card per project repository (including single-repo projects); each card exposes `branchMode_<repoId>` (`new` checked) and `branchName_<repoId>`; fossil repo cards disable the sync option
- [x] 1.6 Run the new tests and confirm they fail for the right reasons

## 2. UI Layer

- [x] 2.1 In `SessionCreatePage.tsx`, widen the `Project` interface with per-repo `repoType` and `newBranch`, and update the GET route to pass them
- [x] 2.2 Replace the session-level Branch form-group (branch input + `branchMode` radios, ≈ lines 211–263) with a per-repository card list mirroring the `RepositoryPicker` card pattern: header (repo name, url/type), mode radio `branchMode_<repoId>`, single branch input `branchName_<repoId>`
- [x] 2.3 Per-card inline script: flipping the radio updates the input label/placeholder ("New branch name" vs "Existing branch to sync"); sync radio disabled with hint for fossil repos
- [x] 2.4 Update the auto-slugify script to fan out to every card's input that is in `new` mode and not manually edited; `?branchName=` prefill seeds all cards and counts as manually edited
- [x] 2.5 Run tests 1.5 (and the full suite) — UI tests green

## 3. Route & Handler

- [x] 3.1 In `pages/sessions.tsx` POST, parse per-repo fields with fallback: `branchMode_<repoId> ?? branchMode ?? "new"` and the analogous branch-name resolution (empty in `new` mode → session slug)
- [x] 3.2 Per-repo validation: sync + empty name → 400 naming the repo; sync + fossil repo → 400 naming the repo
- [x] 3.3 In the per-repo clone loop (≈ lines 669–744), switch the mode branch from session-level variables to the loop-local resolved mode/name; persist the resolved branch per repo entry
- [x] 3.4 Prefix sync clone failure errors with the repository name; keep the existing delete-session cleanup path unchanged
- [x] 3.5 Run the full mimo-platform test suite — all tests green, including pre-existing session tests
