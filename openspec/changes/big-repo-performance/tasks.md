## 1. Lazy File Sync

- [x] 1.1 Add optional full-baseline flag to `FileSyncService.initializeSession()` and default it to false
- [x] 1.2 Remove recursive `scanSessionCheckout()` from default session initialization
- [x] 1.3 Record baseline checksum on first `syncChangesToUpstream()` call for a path
- [x] 1.4 Add public method to trigger full baseline scan manually
- [x] 1.5 Add integration tests for lazy baseline conflict detection
- [x] 1.6 Update `file-sync` delta spec if behavior diverges during implementation

## 2. Incremental Impact Calculation

- [x] 2.1 Add `runSccOnFiles(filePaths[], directory)` method to `SccService`
- [x] 2.2 Add persistent baseline cache storage for `(upstreamPath, workspacePath)` metrics
- [x] 2.3 Modify `ImpactCalculator.calculateImpact()` to detect changed files first
- [x] 2.4 Run SCC only on changed files plus unchanged sample when baseline exists
- [x] 2.5 Merge incremental SCC output with cached baseline to produce full `ImpactMetrics`
- [x] 2.6 Refresh baseline on explicit full refresh and after successful commit/push
- [x] 2.7 Add tests verifying incremental metrics match full-scan metrics for sample repos

## 3. Paginated File Listing

- [x] 3.1 Extend `FileService.listFiles()` signature with `cursor`, `limit`, and `query` parameters
- [x] 3.2 Implement early-exit walker that accumulates `limit + 1` matching results
- [x] 3.3 Move server-side search scoring into the walker
- [x] 3.4 Update `/api/internal/files` endpoint to accept pagination query params
- [x] 3.5 Return `{ files, nextCursor, hasMore }` when pagination is requested
- [x] 3.6 Preserve flat array response when no pagination params are provided
- [x] 3.7 Update UI file finder to request paginated results
- [x] 3.8 Add integration tests for pagination and search

## 4. Bounded Patch Generation

- [x] 4.1 Add `PATCH_MAX_SIZE_BYTES` environment variable resolution at composition root
- [x] 4.2 Inject patch size limit into `VCSConfig`
- [x] 4.3 Change `VCS.generatePatch()` to diff only files from `detectChangedFiles()`
- [x] 4.4 Accumulate patch output and abort when the size limit is exceeded
- [x] 4.5 Return a clear error message and suggestion when patch is too large
- [x] 4.6 Add unit tests for bounded patch generation

## 5. Streaming Large Git Import

- [x] 5.1 Add `MIMO_CLONE_TIMEOUT_MS` and `MIMO_IMPORT_TIMEOUT_MS` resolution at composition root
- [x] 5.2 Inject both timeouts into `VCSConfig`
- [x] 5.3 Split `importGitToFossil()` into explicit clone and import phases with progress logging
- [x] 5.4 Use configurable timeouts in both phases
- [x] 5.5 Distinguish clone, import, and timeout failures in returned errors
- [x] 5.6 Add tests for timeout injection and phase-specific errors

## 6. Expanded Default Exclusions

- [x] 6.1 Add generated/vendor paths to `EXCLUDED_PATHS` in `path-policy.ts`
- [x] 6.2 Add `isGeneratedOrVendorPath()` helper for stricter subsystem filtering
- [x] 6.3 Apply new exclusions in `FileSyncService`, `FileService`, and `ImpactCalculator`
- [x] 6.4 Update `.sccignore` and `.jscpdignore` generation to include new defaults
- [x] 6.5 Add tests verifying large `node_modules`-like directories are skipped

## 7. Integration and Verification

- [x] 7.1 Run full unit test suite in `packages/mimo-platform`
- [x] 7.2 Run full unit test suite in `packages/mimo-agent`
- [ ] 7.3 Manually test with a repository of at least 50,000 files
- [ ] 7.4 Verify impact refresh completes in under 5 seconds for a single-file change
- [x] 7.5 Verify file finder pagination returns bounded results
- [x] 7.6 Update `AGENTS.md` if any developer-facing commands or env vars changed
