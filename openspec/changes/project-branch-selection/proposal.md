## Why

Currently, all projects clone from the default branch of the remote repository. Users need the ability to:
1. Start from a specific branch (e.g., `feature/v2` instead of `main`)
2. Create a dedicated branch for AI sessions (e.g., `ai-session-feature-x`)

This enables workflows where Mimo projects can work on feature branches or create isolated branches for AI-driven development without polluting the main branch.

## What Changes

- Add `sourceBranch` field (optional) - specifies which branch to clone from; empty means use repository default
- Add `newBranch` field (optional) - creates and switches to a new branch locally after cloning
- Update project creation form with two new optional text fields
- Extend VCS layer to support cloning specific branches and creating new branches
- Modify session initialization to create new branch if specified
- Branch information is immutable after project creation
- No immediate push - branch gets pushed on first Commit action

## Capabilities

### New Capabilities

### Modified Capabilities
- `projects`: Extend project creation to support branch selection and branch creation
- `vcs`: Add methods for cloning specific branches and creating new branches in both Git and Fossil

## Impact

- **Database Schema**: Projects table gains `sourceBranch` and `newBranch` columns
- **VCS Layer**: New methods in `src/vcs/index.ts` for branch operations
- **UI**: Project creation form gets two new optional fields
- **Session Setup**: Branch creation logic added to session initialization
- **API**: No breaking changes - new fields are optional
