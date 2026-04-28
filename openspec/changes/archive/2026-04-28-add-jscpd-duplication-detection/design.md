## Context

The mimo platform already has an Impact Buffer that shows code metrics using SCC (boyter/scc) for calculating lines of code and cyclomatic complexity. The architecture follows a consistent pattern:

1. **Service Layer**: `SccService` wraps the external scc binary, handles installation, caching, and execution
2. **Calculator Layer**: `ImpactCalculator` runs comparisons between upstream and workspace, calculating deltas
3. **UI Layer**: `ImpactBuffer` component displays metrics in a side panel
4. **Integration Layer**: Auto-commit in sync service uses metrics to augment commit messages

JSCPD (JavaScript Copy/Paste Detector) is a tool that finds duplicate code blocks across files. It supports multiple languages and can detect both exact duplicates and near-duplicates. The goal is to integrate jscpd following the same architectural patterns as scc.

## Goals / Non-Goals

**Goals:**
- Detect code duplication introduced by agent changes (workspace vs upstream delta)
- Show duplication metrics as a first-class citizen in the Impact Buffer
- Run jscpd efficiently by only scanning changed files
- Provide immediate feedback to prevent technical debt accumulation
- Integrate with auto-commit to warn/block high-duplication commits
- Follow existing SccService patterns for consistency

**Non-Goals:**
- Refactoring suggestions (out of scope—just detection)
- Historical duplication tracking (only current session delta)
- Real-time duplication checking on every keystroke (only on refresh)
- Language-specific duplication detection tuning (use jscpd defaults)

## Decisions

### Decision 1: Run jscpd only on changed files
**Rationale**: Performance. Running jscpd on an entire codebase can be slow (seconds to minutes). By running only on changed files, we reduce the scan to milliseconds for typical agent sessions.

**Alternatives considered:**
- Run on full codebase: Too slow, not needed for delta calculation
- Cache full results and filter: Adds complexity without benefit
- Run incrementally: jscpd doesn't support incremental scanning

### Decision 2: JSCPD service follows SccService pattern exactly
**Rationale**: Consistency. The SccService has proven patterns for:
- Lazy installation
- Smart caching
- Ignore file handling
- Error handling
- Configuration

Following this pattern means:
- Familiar code structure for maintainers
- Reusable caching logic
- Consistent error handling

**Alternatives considered:**
- Inline jscpd calls: Would lose caching and consistency
- Generic "metrics service": Over-abstraction for just two tools

### Decision 3: Duplication percentage = duplicatedLines / totalChangedLines
**Rationale**: Meaningful metric. This shows what percentage of the NEW code is duplicated, which is what matters for detecting agent-introduced duplication.

**Example:**
- Agent adds 100 lines
- 30 of those lines are duplicates of existing code
- Duplication = 30%

**Alternatives considered:**
- Duplicated / total codebase: Would dilute the metric for small changes
- Token-based percentage: Lines are more intuitive for developers

### Decision 4: Show both cross-file and intra-file duplicates
**Rationale**: Both matter. Cross-file duplicates (copy-paste between files) are classic technical debt. Intra-file duplicates (repetition within a file) indicate poor abstraction.

**Alternatives considered:**
- Show only cross-file: Misses important duplication signal
- Combine into single list: Harder to understand and act on

### Decision 5: Thresholds: warn at 15%, block at 30%
**Rationale**: Industry-informed defaults. These are starting points that can be tuned based on usage:
- 15%: Noticeable duplication worth reviewing
- 30%: Significant duplication that should be addressed

**Alternatives considered:**
- Single threshold: Too coarse
- No blocking: Would allow bad commits
- Fixed thresholds: User-configurable is more flexible

### Decision 6: Use @jscpd/core npm package
**Rationale**: jscpd is a Node.js tool. Installing via npm is simpler than downloading a binary (unlike scc which is Go-based and distributed as binary).

**Installation approach:**
- Add as dependency in package.json
- JscpdService wraps the programmatic API
- No manual binary download needed

**Alternatives considered:**
- CLI wrapper like scc: More complex, no benefit
- Global npm install: Less reproducible

## Risks / Trade-offs

**[Risk] JSCPD can be slow even on changed files if many files changed**
→ Mitigation: Cap at reasonable limit (e.g., 100 files), show "partial results" indicator

**[Risk] False positives: jscpd may flag legitimate patterns as duplicates**
→ Mitigation: Default threshold of 70 tokens catches only substantial blocks; user can adjust via config

**[Risk] Increased memory usage from storing clone content**
→ Mitigation: Only store clone metadata in memory; full content fetched on-demand if needed

**[Risk] Breaking change if jscpd API changes**
→ Mitigation: Pin to specific version in package.json; service layer isolates rest of codebase

**[Trade-off] Running only on changed files may miss duplicates between changed and unchanged files**
→ Accepted: This is actually desired—duplication between two NEW files is still caught (both are changed files)

**[Trade-off] Additional dependency increases install size**
→ Accepted: ~2MB for jscpd and dependencies, justified by feature value

## Migration Plan

### Phase 1: Core Service (Tasks 1-3)
- Create JscpdService with installation and execution logic
- Add tests for service layer
- No UI changes yet

### Phase 2: Calculator Integration (Tasks 4-5)
- Extend ImpactCalculator to run jscpd on changed files
- Calculate duplication deltas
- Add duplication to ImpactMetrics type
- Test end-to-end calculation

### Phase 3: UI Display (Tasks 6-7)
- Extend ImpactBuffer with duplication section
- Style according to existing patterns
- Handle empty state

### Phase 4: Auto-Commit Integration (Task 8)
- Add duplication check to sync service
- Implement warning/block logic
- Add configuration options

### Phase 5: Verification (Task 9)
- Integration tests
- Manual testing with real agent sessions
- Performance validation

## Open Questions

1. **Should we show the actual duplicated code in the UI?**
   - Current thinking: Show snippet preview on hover/click, full content in detail view
   - Could be post-MVP enhancement

2. **How do we handle generated code?**
   - Current thinking: jscpd respects ignore files; users can add generated paths to .jscpdignore
   - Could add automatic detection of common generated paths

3. **What about test file duplication?**
   - Current thinking: Include in metrics; test duplication is still technical debt
   - Could add filter option in config

4. **Should we persist duplication metrics?**
   - Current thinking: No—calculated on-demand like SCC
   - Caching is at service layer only

5. **Integration with existing SCC ignore patterns?**
   - Current thinking: Build composite ignore file from .gitignore + .mimoignore + .jscpdignore
   - Similar to how SCC does it
