## Context

The impact calculation pipeline consists of three main stages:

1. **SCC Execution** (`scc-service.ts`): Runs SCC binary on upstream and workspace directories, manages smart cache
2. **File Change Detection** (`changed-files.ts`): Detects added/modified/deleted files by comparing checksums
3. **Delta Calculation** (`calculator.ts`): Computes deltas between upstream and workspace metrics

The complexity values showing variance (e.g., Cyclomatic: -16, -242, 0, 99) are calculated in stage 3 by subtracting upstream complexity from workspace complexity per file.

## Goals / Non-Goals

**Goals:**
- Provide complete visibility into the impact calculation pipeline via debug logging
- Make complexity values interpretable by showing absolute + delta
- Identify the root cause of variance through diagnostic testing
- Implement reliability fixes based on diagnostic findings

**Non-Goals:**
- Replace SCC with a different complexity tool
- Add runtime performance monitoring beyond debug logs
- Change the fundamental caching strategy (only fix bugs in existing strategy)
- Add user-facing settings for debug logging

## Decisions

### Decision: DEBUG env var pattern (existing)

Use the existing `process.env.DEBUG` pattern from `logger.ts`. This is already established in the codebase and requires no infrastructure changes.

Rationale: Consistency with existing logging patterns; no additional dependencies.

### Decision: Log structure (key-value for grepability)

All debug logs will use structured format with brackets for easy grep:
```
[scc:cache] hit for /path/to/dir
[scc:ignore] built from .gitignore (42 patterns)
[scc:raw] {"complexity": 156, ...}
[impact:delta] file.ts: 100 → 106 (+6)
[impact:files] detected: 3 added, 2 modified, 1 deleted
```

Rationale: Structured prefixes enable filtering with `DEBUG=1 npm test 2>&1 | grep "scc:"` for targeted debugging.

### Decision: Show absolute + delta in UI

**Options Considered:**
1. **Delta only** (current): `Cyclomatic: +6 ↑` - Hard to interpret, hides absolute scale
2. **Delta with sign**: `Cyclomatic: +6 (was 100)` - Better but verbose
3. **Absolute with delta**: `Cyclomatic: 100 → 106 (+6) ↑` - Best clarity

**Chosen: Option 3 (absolute with delta)**

Rationale: Users need context. A +6 delta means different things if the base is 10 vs 10000. The arrow trend indicator remains for quick visual scanning.

### Decision: Sort SCC output by path

SCC JSON output order depends on filesystem walk order, which is non-deterministic. Sorting file entries by path before processing ensures consistent calculation order.

Rationale: Non-deterministic ordering could theoretically affect cumulative calculations if there are floating-point edge cases, though primary fix is likely elsewhere. Sorting is cheap insurance.

### Decision: Force flag bypasses cache entirely

Current implementation checks cache before respecting force flag. Changed to: if force=true, skip cache lookup entirely.

Rationale: The force parameter exists for explicit refresh; it should actually refresh.

### Decision: Coerce anomalous deltas to 0 with warning

Define anomaly thresholds:
- Single-file delta > 500% of file's original complexity
- Total delta > 1000 complexity points

When triggered, log warning and cap delta to 0 (assume measurement error).

Rationale: Extreme values are almost certainly bugs, not real complexity changes. Better to show stable 0 than wildly wrong numbers.

## Logging Points

### SccService
- `[scc:cache:check] directory=${dir} force=${force}`
- `[scc:cache:hit] directory=${dir} age=${age}ms`
- `[scc:cache:miss] directory=${dir} reason=${reason}`
- `[scc:ignore:sources] dir=${dir} sources=[${sources}]`
- `[scc:ignore:patterns] count=${count} patterns=[${patterns}]`
- `[scc:exec] cmd=${cmd} args=[${args}]`
- `[scc:raw] directory=${dir} json=${truncatedOutput}`
- `[scc:parse] files=${count} languages=${langs} totalComplexity=${total}`
- `[scc:cache:update] directory=${dir} files=${count}`

### ChangedFiles
- `[files:scan] dir=${dir} files=${count}`
- `[files:compare] upstream=${upCount} workspace=${wsCount}`
- `[files:result] added=${added} modified=${modified} deleted=${deleted}`
- `[files:detail] path=${path} status=${status} checksum=${checksum} size=${size}`

### ImpactCalculator
- `[impact:upstream] complexity=${total} files=${count}`
- `[impact:workspace] complexity=${total} files=${count}`
- `[impact:delta:file] path=${path} old=${old} new=${new} delta=${delta}`
- `[impact:delta:total] cyclomatic=${delta} (upstream=${up} workspace=${ws})`
- `[impact:anomaly] detected: ${description}`
- `[impact:trend] cyclomatic ${prev} → ${curr} (${trend})`

## Risks / Trade-offs

**[Risk] Debug logging impacts performance**
→ Mitigation: Only logs when `DEBUG` env var is set; use lazy string interpolation where possible

**[Risk] Absolute + delta format is too wide for narrow screens**
→ Mitigation: Use compact format `100→106(+6)`; test at 320px width

**[Risk] Anomaly detection produces false positives**
→ Mitigation: Set thresholds conservatively (500%/1000); log warnings so anomalies are visible even if coerced

**[Risk] Sorting SCC output has performance impact**
→ Mitigation: Sort only the files array, not language groups; O(n log n) on file count which is acceptable

**[Risk] Diagnostic test is flaky**
→ Mitigation: Use fixed random seed; retry logic; clear assertions on variance bounds
