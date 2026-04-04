# Proposal: fix-commit-flow

## Why

The current commit implementation is broken. When users click "Commit", the system attempts to commit in the checkout directory which has no repository, and push operations fail because there's no sync with upstream. Additionally, the agent continuously pushes changes to the fossil proxy, but the platform never syncs those changes before committing. The directory naming is also confusing - "checkout" doesn't accurately describe its purpose as an agent workspace.

## What Changes

- **Rename** `checkoutPath` to `agentWorkspacePath` throughout the codebase to clarify its purpose as the agent's working directory (plain files, not a repo)
- **Remove** fossil-based commit logic from `commits/service.ts` - the agent workspace is not a repository
- **Add** proper commit flow: sync from fossil → copy to upstream → commit in upstream → push to remote
- **Add** new VCS methods: `fossilUp()`, `cleanCopyToUpstream()`, `commitUpstream()`, `pushUpstream()`
- **Update** session creation and sync service to use renamed paths
- **Modify** commit message format to include timestamp: "Mimo commit at <ISO datetime>"

## Capabilities

### New Capabilities
- `commit-flow`: Defines the complete workflow for committing agent changes to upstream and pushing to remote, including fossil sync, file copy, and VCS operations

### Modified Capabilities
- `session-management`: Rename `checkoutPath` field to `agentWorkspacePath` in session data structure

## Impact

- **sessions/repository.ts**: Rename `getCheckoutPath()` to `getAgentWorkspacePath()`, update session data structure
- **sessions/routes.tsx**: Update all `checkoutPath` references to `agentWorkspacePath`
- **sync/service.ts**: Update path references and variable names
- **commits/service.ts**: Complete rewrite of `commit()` and `push()` methods to implement correct flow
- **vcs/index.ts**: Add new methods for fossil sync, clean copy, upstream commit, and push
- **Session YAML files**: Field name change from `checkoutPath` to `agentWorkspacePath`
- **Tests**: Update all test expectations for renamed paths
