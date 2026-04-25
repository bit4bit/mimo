## 1. Diagnostic Logging — SccService (`packages/mimo-platform/src/impact/scc-service.ts`)

- [x] 1.1 Add `[scc:cache:check]` log at start of `runScc()` with directory and force flag
- [x] 1.2 Add `[scc:cache:hit]` log when returning cached metrics with cache age
- [x] 1.3 Add `[scc:cache:miss]` log with reason (force=true, stale, no entry, invalid)
- [x] 1.4 Add `[scc:ignore:sources]` log in `buildIgnoreFile()` showing which sources were found
- [x] 1.5 Add `[scc:ignore:patterns]` log showing total pattern count (first 10 patterns)
- [x] 1.6 Add `[scc:exec]` log showing command and args before spawning SCC
- [x] 1.7 Add `[scc:raw]` log with truncated raw JSON output (first 500 chars)
- [x] 1.8 Add `[scc:parse]` log showing parsed totals (files, languages, complexity)
- [x] 1.9 Add `[scc:cache:update]` log when saving new metrics to cache

## 2. Diagnostic Logging — ChangedFiles (`packages/mimo-platform/src/files/changed-files.ts`)

- [x] 2.1 Add `[files:scan]` log at start of `collectFiles()` with directory and file count
- [x] 2.2 Add `[files:compare]` log in `detectChangedFiles()` showing upstream vs workspace counts
- [x] 2.3 Add `[files:result]` log with summary (added, modified, deleted counts)
- [x] 2.4 Add `[files:detail]` log for each changed file with path, status, checksum prefix, size

## 3. Diagnostic Logging — ImpactCalculator (`packages/mimo-platform/src/impact/calculator.ts`)

- [x] 3.1 Add `[impact:upstream]` log after getting upstream metrics with totals
- [x] 3.2 Add `[impact:workspace]` log after getting workspace metrics with totals
- [x] 3.3 Add `[impact:delta:file]` log for each file delta in the calculation loop
- [x] 3.4 Add `[impact:delta:total]` log showing final deltas with upstream/workspace absolute values
- [x] 3.5 Add `[impact:anomaly]` log when delta exceeds thresholds (single file >500%, total >1000)
- [x] 3.6 Add `[impact:trend]` log showing trend calculation with previous vs current values

## 4. Reliability Fixes — SccService (`packages/mimo-platform/src/impact/scc-service.ts`)

- [x] 4.1 Fix cache check order: check force flag BEFORE cache lookup (skip cache if force=true)
- [x] 4.2 Sort SCC output files by path in `parseSccOutput()` before processing
- [x] 4.3 Add validation for negative complexity values (coerce to 0 with warning)
- [x] 4.4 Ensure cache invalidation properly clears stale markers

## 5. Reliability Fixes — ImpactCalculator (`packages/mimo-platform/src/impact/calculator.ts`)

- [x] 5.1 Add anomaly detection for extreme deltas (>500% single file, >1000 total)
- [x] 5.2 Log anomaly details and coerce to 0 when detected
- [x] 5.3 Ensure consistent Map iteration order by sorting files before processing
- [x] 5.4 Add validation for mismatched upstream/workspace file counts

## 6. UI Enhancement — Chat Impact Display (`packages/mimo-platform/public/js/chat.js`)

- [x] 6.1 Modify complexity display format from `${metrics.complexity.cyclomatic}` to `${before}→${after}(+${delta})`
- [x] 6.2 Add absolute value properties to impact metrics response (upstream total, workspace total)
- [x] 6.3 Update trend arrow to follow the delta value: `100 → 106 (+6) ↑`
- [x] 6.4 Apply same format to Cognitive complexity display
- [x] 6.5 Ensure compact display fits in impact buffer width (test at 320px)

## 7. Diagnostic Test — Impact Reliability (`packages/mimo-platform/test/impact-reliability.test.ts`)

- [x] 7.1 Create test file with describe block "Impact Calculation Reliability"
- [x] 7.2 Write test: "calculates consistent complexity across multiple runs"
  - Run impact calculation 5 times on same session
  - Assert all cyclomatic values are within ±5% of mean
- [x] 7.3 Write test: "detects variance with concurrent file modifications"
  - Simulate file write during calculation
  - Assert variance is logged and flagged
- [x] 7.4 Write test: "cache bypass on force refresh clears stale data"
  - Populate cache, modify file, force refresh
  - Assert new values reflect modifications
- [x] 7.5 Write test: "anomaly detection flags extreme deltas"
  - Inject extreme delta value
  - Assert anomaly is logged and coerced to 0

## 8. API Response Update (`packages/mimo-platform/src/impact/routes.ts` or equivalent)

- [x] 8.1 Add `absoluteCyclomatic` and `absoluteCognitive` fields to impact response
- [x] 8.2 Add `upstreamComplexity` and `workspaceComplexity` breakdowns
- [x] 8.3 Ensure backward compatibility (new fields are additive only)

## 9. Documentation

- [ ] 9.1 Update IMPACT.md or equivalent with debug logging usage instructions
- [ ] 9.2 Document anomaly thresholds and behavior
- [ ] 9.3 Add troubleshooting section for inconsistent complexity values

## 10. Verification

- [ ] 10.1 Run `cd packages/mimo-platform && bun test` — all tests pass
- [ ] 10.2 Run `DEBUG=1 bun test impact-reliability` — see structured debug output
- [ ] 10.3 Manual: Refresh impact buffer 10 times, verify values within ±5%
- [ ] 10.4 Manual: Check UI displays `100 → 106 (+6) ↑` format
- [ ] 10.5 Manual: Verify anomaly detection logs warnings for extreme values
