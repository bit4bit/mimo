## Context

Currently, projects are created by cloning the default branch from a remote repository. The VCS layer in `src/vcs/index.ts` supports cloning but doesn't handle branch selection. The session creation process in `src/sessions/routes.tsx` handles repository setup but assumes default branch behavior.

The Project model stores repository information but lacks branch-related fields. The UI forms for project creation need to collect optional branch preferences from users.

## Goals / Non-Goals

**Goals:**
- Allow users to optionally specify a source branch to clone from (empty = repo default)
- Allow users to optionally create a new branch locally for the project
- Support both Git and Fossil VCS systems with their respective branch semantics
- Create branches during project initialization, not pushed immediately
- Branch info is immutable after project creation

**Non-Goals:**
- Branch validation against remote (user provides exact branch names)
- Immediate push of new branch (handled by existing Commit action)
- Editable branch settings after project creation
- Branch protection or permission checks

## Decisions

### 1. Branch Creation Timing
**Decision**: Create branch during session initialization, not during project creation.
**Rationale**: Project creation only stores metadata; actual repository clone happens when first session is created. This keeps project creation lightweight.

### 2. No Branch Validation
**Decision**: Do not validate branch existence before cloning.
**Rationale**: Let the underlying VCS commands fail naturally if branch doesn't exist. This matches current behavior with repo URLs.

### 3. Git vs Fossil Handling
**Decision**: Handle branch operations differently for each VCS:
- Git: Use `--branch` flag for clone, `checkout -b` for new branch
- Fossil: Clone full repo, then `checkout` for source branch, `branch new` for new branch
**Rationale**: Fossil has different branching model - all branches exist in the repo.

### 4. Force Behavior
**Decision**: For Git, if new branch exists locally, overwrite. For Fossil, branch creation updates if exists.
**Rationale**: User wants to use this branch; if it exists, they want to work on it.

## Risks / Trade-offs

- **Risk**: Invalid branch names cause clone failures
  - **Mitigation**: User sees VCS error message; can recreate project with correct name

- **Risk**: Branch name collisions if multiple projects use same newBranch name
  - **Mitigation**: Each project has isolated upstream directory; branches don't conflict

- **Risk**: Fossil `branch new` behavior differs from Git
  - **Mitigation**: Document behavior differences; Fossil updates existing branches gracefully

- **Trade-off**: No remote validation means user might typo branch name
  - **Acceptance**: Consistent with current URL behavior (we don't validate URLs exist)
