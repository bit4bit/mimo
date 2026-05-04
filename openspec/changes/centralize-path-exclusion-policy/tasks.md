## 1. Create centralized path policy module

- [x] 1.1 Create `domain/files/path-policy.ts` with `EXCLUDED_PATHS` and `isExcluded(path)`
- [x] 1.2 Write integration tests for `path-policy` that verify exact match, prefix match, nested component match, and normal files returning `false`

## 2. Update file finder to use centralized exclusions

- [x] 2.1 Update `domain/files/service.ts` to import `EXCLUDED_PATHS` and include it in the file finder filter pipeline
- [x] 2.2 Delete `DEFAULT_IGNORE_PATTERNS` from `domain/files/service.ts`
- [x] 2.3 Update `test/files-service.test.ts` to verify that VCS internals (`.git`, `.fossil`, `.fossil-settings`) are excluded from file finder results

## 3. Update impact analysis to use centralized exclusions

- [x] 3.1 Update `domain/files/impact-file-policy.ts` to import `isExcluded` from `path-policy`
- [x] 3.2 Replace `IMPACT_EXCLUDED_PATHS`, `IMPACT_EXCLUDED_PATH_PREFIXES`, and `buildImpactIgnorePatterns` with a call to `isExcluded`
- [x] 3.3 Update impact-related tests to verify that `.git/`, `.mimo/`, `.sccignore`, `.jscpdignore` are excluded from impact counts

## 4. Update VCS layer to use centralized exclusions

- [x] 4.1 Update `domain/vcs/index.ts` to import `EXCLUDED_PATHS` and `isExcluded` from `path-policy`
- [x] 4.2 Replace `VCS_INTERNALS` with `isExcluded` in `scanDirectory`
- [x] 4.3 Replace `VCS_METADATA` with `isExcluded` in diff cleaning
- [x] 4.4 Replace `DEFAULT_FOSSIL_IGNORE_PATTERNS` with a mapping from `EXCLUDED_PATHS` in `syncIgnoresToFossil`
- [x] 4.5 Update `test/vcs.test.ts` to verify that `syncIgnoresToFossil` still produces the correct default patterns (`.git`, `.git/**`, etc.)

## 5. Update remaining consumers

- [x] 5.1 Update `domain/files/changed-files.ts` to import `isExcluded` from `path-policy`
- [x] 5.2 Update `domain/sync/service.ts` to import `isExcluded` from `path-policy`
- [x] 5.3 Update `web/features/sessions/pages/sessions.tsx` to import `isExcluded` from `path-policy`

## 6. Cleanup and verify

- [x] 6.1 Delete `VCS_INTERNALS`, `VCS_METADATA`, and `DEFAULT_FOSSIL_IGNORE_PATTERNS` from `domain/vcs/index.ts`
- [x] 6.2 Delete `IMPACT_EXCLUDED_PATHS`, `IMPACT_EXCLUDED_PATH_PREFIXES`, and `buildImpactIgnorePatterns` from `domain/files/impact-file-policy.ts`
- [x] 6.3 Run `bun test` in `packages/mimo-platform`
- [x] 6.4 Run `bun run test.full` in `packages/mimo-platform` if unit tests pass
- [x] 6.5 Fix any regressions before applying changes
