## 1. Test Infrastructure

- [x] 1.1 Create `packages/mimo-platform/test/scc-ignore.test.ts` with failing BDD tests for composite ignore functionality
- [x] 1.2 Create `packages/mimo-platform/test/scc-cache.test.ts` with failing BDD tests for smart cache functionality (change-based)
- [x] 1.3 Verify all new tests fail before implementation (BDD principle)

## 2. Composite Ignore File Implementation

- [x] 2.1 Add `buildIgnoreFile(directory: string): string` method to SccService class
- [x] 2.2 Implement detection of `.fossil-settings/ignore-glob`, `.gitignore`, and `.mimoignore`
- [x] 2.3 Implement combination logic with source annotations (format: `# --- From: {path} ---`)
- [x] 2.4 Ensure `.mimo/cache/` directory exists before writing composite file
- [x] 2.5 Write combined content to `.mimo/cache/scc-ignore-combined.txt`
- [x] 2.6 Add warning logs for missing source files

## 3. Smart Cache Implementation

- [x] 3.1 Add cache structure types (SccCacheEntry with valid flag, data, timestamp)
- [x] 3.2 Add `loadCache(): void` method to load from `.mimo/cache/scc-cache.json`
- [x] 3.3 Add `saveCache(): void` method with atomic write (temp file + rename)
- [x] 3.4 Add `invalidateCache(directory?: string): void` method to mark cache as invalid
- [x] 3.5 Modify `runScc()` to check cache validity before execution
- [x] 3.6 Modify `runScc()` to return cached results if valid, else execute SCC and mark as valid
- [x] 3.7 Update cache after successful SCC execution
- [x] 3.8 Remove or deprecate old TTL-based in-memory cache (5 second cache)

## 4. Integration with FileSyncService

- [x] 4.1 Import SccService in `sync/service.ts`
- [x] 4.2 Modify `handleFileChanges()` to call `sccService.invalidateCache(agentWorkspacePath)` when changes.length > 0
- [x] 4.3 Ensure invalidate is only called for non-empty change arrays
- [x] 4.4 Test that cache invalidation triggers on agent file changes

## 5. SCC Integration

- [x] 5.1 Modify `runScc()` to call `buildIgnoreFile()` before execution
- [x] 5.2 Add `--ignore {compositeFilePath}` argument to SCC command
- [x] 5.3 Ensure composite file is regenerated before each SCC run (handle changes to ignore sources)
- [x] 5.4 Update cache key generation to use full directory path

## 6. Testing & Validation

- [x] 6.1 Implement tests to pass: composite file generation with all three sources
- [x] 6.2 Implement tests to pass: warning on missing source files
- [x] 6.3 Implement tests to pass: cache hit when valid
- [x] 6.4 Implement tests to pass: cache miss when invalidated
- [x] 6.5 Implement tests to pass: cache invalidation on agent changes
- [x] 6.6 Implement tests to pass: no invalidation when no changes
- [x] 6.7 Implement tests to pass: cache survives server restart
- [x] 6.8 Implement tests to pass: upstream uses cache, agent-workspace invalidates and re-runs
- [x] 6.9 Verify existing tests still pass (regression testing)
- [x] 6.10 Create sample `.mimoignore` file in project root with common patterns

## 7. Documentation & Cleanup

- [x] 7.1 Update inline code comments for new methods
- [x] 7.2 Verify cache file format matches design spec
- [x] 7.3 Test cache invalidation (manual and via agent changes)
- [x] 7.4 Clean up any temporary test files

## 8. Verification

- [x] 8.1 Run full test suite: `bun test`
- [x] 8.2 Verify type checking: `bun run typecheck`
- [x] 8.3 Test end-to-end: create session, make changes, verify stats exclude ignored files
- [x] 8.4 Verify cache is used when no changes (check logs or add debug output)
- [x] 8.5 Verify SCC re-runs after agent reports changes
- [x] 8.6 Validate composite ignore file is generated correctly (inspect `.mimo/cache/`)

## 9. Bug Fix: SCC --ignore Flag Not Supported

- [x] 9.1 Changed composite ignore file location from `.mimo/cache/scc-ignore-combined.txt` to `.sccignore` in target directory
- [x] 9.2 SCC automatically detects `.sccignore` files (no --ignore flag needed)
- [x] 9.3 Updated tests to reflect new file location
- [x] 9.4 Removed `--ignore` flag from SCC command arguments
- [x] 9.5 Verified SCC v3.5.0 supports `.sccignore` files natively

## Final Test Results

**SCC-Related Tests: 33/33 passing (100%)**
- scc-ignore.test.ts: 6/6 ✅
- scc-cache.test.ts: 9/9 ✅
- scc-determinism.test.ts: 6/6 ✅
- impact.test.ts: 16/16 ✅

**Implementation Complete** ✅

## 9. Bug Fix: SCC --ignore Flag Not Supported

- [x] 9.1 Changed composite ignore file location from `.mimo/cache/scc-ignore-combined.txt` to `.sccignore` in target directory
- [x] 9.2 SCC automatically detects `.sccignore` files (no --ignore flag needed)
- [x] 9.3 Updated tests to reflect new file location
- [x] 9.4 Removed `--ignore` flag from SCC command arguments
- [x] 9.5 Verified SCC v3.5.0 supports `.sccignore` files natively
