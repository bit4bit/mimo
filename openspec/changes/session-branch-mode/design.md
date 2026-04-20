## Context

Session creation already has a single "Branch" input on the new-session form (added by the `project-branch-selection` change). The handler unconditionally clones the project's `sourceBranch` and then creates the typed branch locally via `git checkout -B`. That collapses two distinct user intents — "I'm starting something new" vs. "I'm resuming branch X that's already on the remote" — into one flow that only works for the first case.

This change separates those intents via an explicit mode selector on the form, and mode-aware clone/branch logic in the POST handler.

## Goals / Non-Goals

**Goals:**
- Let users resume work from an existing remote branch when creating a session.
- Preserve current "create new branch" behavior exactly (same default, same output).
- Keep the change minimal: reuse `vcs.cloneRepository`'s existing `sourceBranch` parameter; add no new VCS methods.

**Non-Goals:**
- Fossil sync support. Fossil has branching semantics (`fossil branch ls`, `fossil checkout`) but shipping a parallel code path doubles the testing surface and is deferred.
- Pre-clone validation (e.g. `git ls-remote`) to check whether the branch exists. The clone's own error surface is sufficient and avoids an extra network round-trip.
- Dropdown / autocomplete of remote branches. Adds form-render latency and authentication complexity.
- Persisting the chosen mode on the session. `session.branch` is the only downstream consumer; the mode is used only during creation.

## Decisions

### 1. UI: radio buttons, not checkbox or dropdown
**Decision**: Two radios ("Create new branch" / "Sync existing branch"), default to `new`.
**Rationale**: The intents are mutually exclusive and benefit from explicit naming. A checkbox ("branch already exists") would be terser but ambiguous for first-time users. A dropdown of remote branches would be richer but requires backend changes to fetch branches on form render.

### 2. Default mode: `new`
**Decision**: Default `branchMode` is `"new"` when the form field is omitted.
**Rationale**: Preserves the current behavior for any client that doesn't yet send the field (e.g. curl clients, older browsers that lost the form state) and for the existing test suite.

### 3. Sync mode clones with `--branch` (no separate checkout)
**Decision**: In sync mode, pass `branchName` as the 5th argument to `vcs.cloneRepository`, which already supports `git clone --branch`. Skip `vcs.createBranch` entirely.
**Rationale**: One shell invocation instead of two; the upstream working tree is on the target branch immediately; avoids the `checkout -B` semantics (which would overwrite local branch state).

### 4. Backend-only fossil gating
**Decision**: Reject `branchMode=sync` with `repoType=fossil` as 400 at the route handler. Do not hide the radio on the client.
**Rationale**: The UI stays static (no per-project conditional rendering, no JS). Fossil projects are the minority; the 400 is discoverable and explicit.

### 5. No pre-clone `ls-remote` check
**Decision**: Let `git clone --branch <missing>` fail naturally and return 500 with the underlying error.
**Rationale**: `ls-remote` is a second network call that can fail or race against a push. Trusting the clone's error is simpler and matches existing project-creation behavior (we don't validate `repoUrl` ahead of time either).

### 6. Persist `session.branch` in both modes
**Decision**: In sync mode, still call `sessionRepository.update(session.id, { branch: branchName })` even though `createBranch` was skipped.
**Rationale**: `commits/service.ts` line 405 uses `session.branch` to pick the push target. Setting it in both modes means the push path is mode-agnostic — no changes to the commit service.

### 7. Do not persist `branchMode`
**Decision**: `branchMode` is read off the form, used to pick code paths, and discarded. It is not added to `Session` / `SessionData`.
**Rationale**: After clone, the mode is no longer load-bearing — the branch either exists (sync) or was created (new), and both are captured by `session.branch`. The settings page doesn't need to distinguish.

## Risks / Trade-offs

- **Risk**: Users select sync mode for a branch that exists only locally on their machine. The clone fails with "Remote branch not found".
  - **Mitigation**: The error message is passed through verbatim; the session is deleted; the user can retry with `new` mode.

- **Risk**: Fossil users want sync mode and see a confusing 400.
  - **Mitigation**: Error message explicitly names the limitation ("Sync mode is only supported for git repositories"). A follow-up change can add fossil sync if demand warrants it.

- **Trade-off**: No client-side disabling of the sync radio for fossil projects.
  - **Acceptance**: Keeps the form purely server-rendered. Cost is one extra round-trip on the (rare) mis-selection.

- **Trade-off**: Mode not persisted means the settings page can't say "this session is syncing branch X vs. created branch X."
  - **Acceptance**: Users care about *which branch* the session uses, not how it got there. If that changes, adding a `branchMode` field to `Session` is a mechanical follow-up.
