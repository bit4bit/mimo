## Why

The current sync mechanism (`cleanCopyToUpstream`) copies files one-by-one from agent-workspace to upstream using `copyFileSync`. This works but produces no record of what changed between sync cycles. We want a historical audit trail of every set of changes applied to upstream, and a cleaner sync mechanism that uses standard patch/diff tooling instead of custom file-walking logic.

## What Changes

- Replace `cleanCopyToUpstream` in `VCS` with a patch-based workflow: generate unified diff, store as `.patch` file in the session, apply to upstream
- Add `alignWorkspaceWithFossil` pre-processing step to handle `fossil rm` without physical deletion (aligns disk state with fossil tracking state before generating diffs)
- Add `patches/` directory to each session for storing historical patch files
- Support both git and fossil upstream repos: `git apply --binary` for git, `patch -p1` for fossil
- Filter VCS metadata files (`.fslckout`, `.fossil`, `_FOSSIL_`) from generated patches
- Handle `git diff --no-index` exit code 1 as normal (means differences found)
- **BREAKING**: `cleanCopyToUpstream` is removed and replaced by `generateAndApplyPatch`

## Capabilities

### New Capabilities
- `patch-sync`: Patch-based synchronization from agent-workspace to upstream, including diff generation, storage, and application

### Modified Capabilities
- `session-management`: Sessions now include a `patches/` directory created at initialization for storing historical patch files

## Impact

- `packages/mimo-platform/src/vcs/index.ts`: Remove `cleanCopyToUpstream`, add `generatePatch`, `applyPatch`, `storePatch`, `alignWorkspaceWithFossil`, `generateAndApplyPatch`
- `packages/mimo-platform/src/commits/service.ts`: Update step 2 in `commitAndPush` to call `generateAndApplyPatch` instead of `cleanCopyToUpstream`
- `packages/mimo-platform/src/sessions/repository.ts`: Create `patches/` directory during session initialization
- `packages/mimo-platform/test/commits.test.ts`: Update tests for new sync mechanism
- `packages/mimo-platform/test/sync.test.ts`: May need updates if `FileSyncService` is affected
