## 1. Setup and Dependencies

- [x] 1.1 Add `@jscpd/core` and `@jscpd/tokenizer` dependencies to `packages/mimo-platform/package.json`
- [x] 1.2 Run `bun install` to install new dependencies
- [x] 1.3 Create `packages/mimo-platform/src/impact/jscpd-service.ts` file with basic structure

## 2. JSCPD Service Implementation

- [x] 2.1 Define `JscpdMetrics` interface with duplicatedLines, duplicatedTokens, percentage, and clones array
- [x] 2.2 Define `Clone` interface with file paths, line numbers, tokens, content, and type (cross/intra)
- [x] 2.3 Implement `JscpdService` class with constructor accepting custom binary path
- [x] 2.4 Implement `isInstalled()` method to check if jscpd is available
- [x] 2.5 Implement `install()` method to install jscpd via npm (or ensure it's available)
- [x] 2.6 Implement `runOnFiles(filePaths, directory)` method that executes jscpd on specific files
- [x] 2.7 Implement `parseJscpdOutput()` to transform jscpd JSON into `JscpdMetrics` structure
- [x] 2.8 Implement `buildIgnoreFile(directory)` to create composite .jscpdignore from .gitignore, .mimoignore
- [x] 2.9 Add `getJscpdService()` singleton factory function

## 3. JSCPD Service Tests

- [x] 3.1 Create `packages/mimo-platform/test/jscpd-service.test.ts`
- [x] 3.2 Write test for service initialization
- [x] 3.3 Write test for parsing jscpd output with cross-file duplicates
- [x] 3.4 Write test for parsing jscpd output with intra-file duplicates
- [x] 3.5 Write test for empty results (no duplicates)
- [x] 3.6 Write test for ignore file building
- [x] 3.7 Run tests and ensure they pass

## 4. Impact Calculator Extension

- [x] 4.1 Define `DuplicationMetrics` interface extending `ImpactMetrics`
- [x] 4.2 Add `calculateDuplication(changedFiles, workspacePath)` private method to `ImpactCalculator`
- [x] 4.3 Integrate jscpd service call into `calculateImpact()` method
- [x] 4.4 Implement clone filtering logic: keep clones where at least one file is in changed files
- [x] 4.5 Calculate `percentage` as (duplicatedLines / totalChangedLines) * 100
- [x] 4.6 Group clones by file in `byFile` map
- [x] 4.7 Add duplication data to returned `ImpactMetrics` object

## 5. Calculator Tests

- [x] 5.1 Create `packages/mimo-platform/test/impact-calculator-duplication.test.ts`
- [x] 5.2 Write test for duplication calculation with new file that duplicates existing code
- [x] 5.3 Write test for duplication between two new files
- [x] 5.4 Write test for intra-file duplication within a changed file
- [x] 5.5 Write test for zero duplication (clean changes)
- [x] 5.6 Write test for duplication percentage calculation
- [x] 5.7 Run tests and ensure they pass

## 6. Impact Buffer UI Extension

- [x] 6.1 Extend `ImpactBuffer.tsx` `ImpactMetrics` interface to include duplication field
- [x] 6.2 Add Code Duplication section after Complexity section
- [x] 6.3 Display total duplicated lines and percentage with trend indicator
- [x] 6.4 Create Cross-File Duplicates subsection with file pairs and line counts
- [x] 6.5 Create Intra-File Duplicates subsection with file and line ranges
- [x] 6.6 Add visual styling for high duplication (>30%) with warning color
- [x] 6.7 Add empty state handling when no duplication detected
- [x] 6.8 Add CSS classes following existing patterns (`.impact-section`, `.impact-metric`, etc.)

## 7. UI Tests

- [x] 7.1 Create/update `packages/mimo-platform/test/impact-buffer.test.tsx`
- [x] 7.2 Write test for rendering duplication section with data
- [x] 7.3 Write test for empty duplication state
- [x] 7.4 Write test for high duplication warning styling
- [x] 7.5 Run tests and ensure they pass

## 8. Auto-Commit Integration

- [x] 8.1 Extend `SyncService` configuration to include `duplicationWarningThreshold` (default: 15)
- [x] 8.2 Extend `SyncService` configuration to include `duplicationBlockThreshold` (default: 30)
- [x] 8.3 Add duplication check in auto-commit flow before creating commit
- [x] 8.4 Implement warning logic: append duplication info to commit message when >= warningThreshold
- [x] 8.5 Implement blocking logic: prevent commit and notify user when >= blockThreshold
- [x] 8.6 Add user notification message with duplication details when blocking
- [x] 8.7 Ensure thresholds are configurable per session

## 9. Integration and Verification

- [x] 9.1 Run all existing tests to ensure no regressions: `cd packages/mimo-platform && bun test`
- [x] 9.2 Create manual test script that simulates agent session with duplicated code
- [x] 9.3 Verify jscpd service correctly detects cross-file duplicates
- [x] 9.4 Verify jscpd service correctly detects intra-file duplicates
- [x] 9.5 Verify Impact Buffer displays duplication section correctly
- [x] 9.6 Verify auto-commit warning appears at 15% duplication
- [x] 9.7 Verify auto-commit blocks at 30% duplication
- [x] 9.8 Performance test: verify jscpd runs in <2s for 50 changed files

## 10. Documentation

- [x] 10.1 Update AGENTS.md with duplication detection feature description
- [x] 10.2 Add example of duplication metrics in documentation
- [x] 10.3 Document threshold configuration options
- [x] 10.4 Verify all code comments are clear and complete
