## 1. Session patches directory

- [x] 1.1 Add `patches/` directory creation in `SessionRepository.create()` (`sessions/repository.ts`)

## 2. Workspace alignment

- [x] 2.1 Add `alignWorkspaceWithFossil(workspacePath)` method to `VCS` class - runs `fossil changes`, parses DELETED files, physically unlinks them from disk

## 3. Patch generation

- [x] 3.1 Add `generatePatch(agentWorkspacePath, upstreamPath)` method to `VCS` class - runs `git diff --binary --no-index` from session parent dir, handles exit code 1 as success
- [x] 3.2 Add `normalizePatchPaths(patch)` private method - replaces `a/upstream/` with `a/` and `b/agent-workspace/` with `b/` in diff headers
- [x] 3.3 Add `filterVcsMetadata(patch)` private method - removes diff hunks for `.fslckout`, `.fossil`, `_FOSSIL_`, `.fslckout-journal`

## 4. Patch storage

- [x] 4.1 Add `storePatch(patchDir, patchContent)` method to `VCS` class - writes patch to `{patchDir}/{ISO-timestamp}.patch`, returns file path

## 5. Patch application

- [x] 5.1 Add `applyPatch(patchFilePath, upstreamPath, repoType)` method to `VCS` class - uses `git apply --binary` for git, `patch -p1` for fossil

## 6. Orchestration

- [x] 6.1 Add `generateAndApplyPatch(agentWorkspacePath, upstreamPath, patchDir, repoType)` method to `VCS` class - orchestrates align, generate, store, apply in sequence
- [x] 6.2 Update `CommitService.commitAndPush()` step 2 in `commits/service.ts` to call `generateAndApplyPatch` instead of `cleanCopyToUpstream`
- [x] 6.3 Remove `cleanCopyToUpstream` from `VCS` class (or deprecate)

## 7. Tests

- [x] 7.1 Add tests for `alignWorkspaceWithFossil` - verify fossil rm files are physically deleted
- [x] 7.2 Add tests for `generatePatch` - verify patch generation for new, modified, deleted files and empty case
- [x] 7.3 Add tests for `normalizePatchPaths` and `filterVcsMetadata`
- [x] 7.4 Add tests for `applyPatch` - verify git apply and patch -p1 paths
- [x] 7.5 Add integration test for full `generateAndApplyPatch` workflow
- [x] 7.6 Update existing `commits.test.ts` tests to work with new patch-based sync
