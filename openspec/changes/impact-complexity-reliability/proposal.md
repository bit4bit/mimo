## Why

The complexity block in the impact buffer displays wildly inconsistent values on each run. For example, Cyclomatic complexity shows -16, -242, 0, or 99 for the same codebase. This makes the metric unreliable and untrustworthy for users trying to assess the impact of their changes.

The root cause is likely non-deterministic behavior in the SCC (Source Code Counter) execution, cache management, or file state detection. Without visibility into the calculation pipeline, debugging is impossible.

## What Changes

### Phase 1: Diagnostic Infrastructure
- Add comprehensive debug logging to the entire impact calculation pipeline
- Log SCC cache hits/misses with directory paths and timestamps
- Log ignore file pattern resolution (which files are excluded and why)
- Log raw SCC JSON output before parsing
- Log changed files detection results with checksums and sizes
- Log impact delta calculations with per-file breakdowns showing old vs new values

### Phase 2: Enhanced Display Format
- Modify the UI to show absolute values + delta instead of just delta
- Current: `Cyclomatic: +6 ↑` (delta only)
- New: `Cyclomatic: 156 → 162 (+6) ↑` (absolute + delta)
- This makes the values interpretable and helps identify when absolute values are inconsistent

### Phase 3: Diagnostic Test
- Create a concurrency stress test that simulates file modifications during impact calculation
- Run impact calculation multiple times in rapid succession
- Capture variance in results and identify which stage causes inconsistency
- Validate that logging provides sufficient traceability to diagnose issues

### Phase 4: Reliability Fixes
- Sort SCC output by file path before processing to ensure consistent ordering
- Force cache bypass on explicit refresh (respect `force` parameter in cache lookup)
- Add validation for anomalous deltas (flag deltas >500% or absolute changes >1000)
- Consider file state snapshotting if needed for true consistency

## Capabilities

### Modified Capabilities
- `impact-calculation`: Enhanced with comprehensive debug logging and improved reliability
- `impact-display`: Enhanced to show absolute values alongside deltas

## Impact

- **SccService**: Add debug logging for cache operations, ignore file building, and raw SCC output
- **ImpactCalculator**: Add debug logging for delta calculations with per-file breakdowns
- **ChangedFiles**: Add debug logging for file detection results
- **UI (chat.js)**: Modify complexity display format from delta-only to absolute + delta
- **Tests**: Add diagnostic concurrency test for reliability validation
- **Backward compat**: All changes are additive; no breaking changes to APIs or data structures
- **Dependencies**: None
- **Auth**: No changes

## Success Criteria

- Running impact calculation 10 times on the same codebase produces consistent results within ±5%
- Debug logs clearly show cache hit/miss decisions and file state transitions
- UI displays interpretable absolute + delta format for all complexity metrics
- Diagnostic test identifies and reports variance sources if they exist
