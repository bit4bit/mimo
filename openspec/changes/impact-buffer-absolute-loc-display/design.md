## Context

The Impact Buffer displays code metrics from SCC (Source Code Counter) analysis. Currently:

**Complexity section** (works well):
- Shows absolute values with deltas: `Cyclomatic: 25→32(+7)`
- Uses `absoluteComplexity: { upstream: number, workspace: number }`
- Displays trends (↑↓→) comparing to previous refresh

**Lines of Code section** (inconsistent):
- Shows only deltas: `Added: +450`
- No absolute context (is +400 lines significant?)
- Same trend arrows but no absolute value comparison

The codebase already has infrastructure for tracking absolute values - we need to extend it to LOC.

## Goals / Non-Goals

**Goals:**
- Add total lines aggregate to SCC metrics
- Compute absolute LOC values (total, added, removed) for upstream vs workspace
- Display LOC as `upstream→workspace(delta)` format matching complexity
- Add trend indicators for absolute LOC values
- Display Total, Added, Removed (remove Net metric from display)

**Non-Goals:**
- No changes to complexity display (already works)
- No changes to files, duplication, or dependency sections
- No new external dependencies
- No changes to SCC tool invocation or parsing logic (beyond aggregate calculation)

## Decisions

### DECISION-1: Use `lines` (total lines) not `code` (code-only lines)

**Rationale:** Total lines is more intuitive for users. "Code lines" (excluding comments/blanks) is a secondary metric. The aggregate should reflect what users expect when they think "how big is my codebase?"

**Alternatives:**
- Could show both: Rejected - too cluttered
- Could use `code` only: Rejected - comments and blanks are still lines

### DECISION-2: Display Total, Added, Removed (not Net)

**Rationale:** Net is derivable from (Total workspace - Total upstream) or (Added - Removed). Showing three explicit metrics is clearer than four. Total gives absolute context, Added/Removed give change breakdown.

**Display format:**
```
Lines of Code
  Total: 1500→1900(+400)
  Added: 1200→1650(+450)
  Removed: 300→250(-50)
```

**Alternatives:**
- Keep Net: Rejected - redundant with Total and delta calculation
- Show Added/Removed/Net (no Total): Rejected - loses absolute context

### DECISION-3: Compute absolute "added" and "removed" as cumulative counters

**Rationale:** In the context of comparing upstream vs workspace:
- In upstream: nothing is "added" or "removed" (it's the baseline)
- In workspace: "added" = total lines added across all files, "removed" = total lines removed across all files

This means:
- `absoluteLoc.added.upstream = 0`
- `absoluteLoc.added.workspace = linesAdded` (the delta)
- `absoluteLoc.removed.upstream = 0`
- `absoluteLoc.removed.workspace = linesRemoved` (the delta)

**Display shows:**
- Added: `0→450(+450)` (nothing added upstream, 450 added in workspace)
- Removed: `0→50(-50)` (nothing removed upstream, 50 removed in workspace)

**Alternatives:**
- Could compute "lines present that were added": Rejected - that's just total delta
- Could track cumulative over multiple sessions: Rejected - scope creep

### DECISION-4: Trend arrows compare absolute values between refreshes

**Rationale:** Consistent with complexity trends. Shows whether the codebase is growing/shrinking.

**Trend calculation:**
- `trend = current.absoluteLoc.total.workspace > previous.absoluteLoc.total.workspace ? "↑" : (less ? "↓" : "→")`

**Example:**
- Refresh 1: Total workspace = 1500 → trend = "→" (no previous)
- Refresh 2: Total workspace = 1900 → trend = "↑" (increased from 1500)
- Refresh 3: Total workspace = 1900 → trend = "→" (stable)

**Alternatives:**
- Compare deltas: Rejected - less meaningful (a +400→+400 delta doesn't tell you if total grew)

### DECISION-5: Additive changes only (backwards compatible)

**Rationale:** No breaking changes. Older clients receive new fields as undefined and show defaults.

**Implementation:**
- UI uses: `metrics.absoluteLoc?.total?.upstream ?? 0`
- Tests update assertions to include new fields
- Existing functionality unchanged

## Risks / Trade-offs

**[Risk] Performance impact from aggregate calculation**
- The aggregate requires summing all file metrics
- Mitigation: File count is typically small (hundreds), summing is O(n) and negligible

**[Risk] Memory overhead from storing PreviousState**
- PreviousState now stores additional absoluteLoc values
- Mitigation: 6 additional numbers per session, negligible memory impact

**[Risk] UI confusion from removed "Net" metric**
- Users accustomed to seeing Net LOC may miss it
- Mitigation: Total metric makes Net redundant; delta shown in Total

**[Trade-off] Removed lines display may be counterintuitive**
- Shows "0→50(-50)" meaning "50 lines were removed in workspace"
- Could be interpreted as "we have negative lines"
- Accepted: Consistent with Added display; delta clarifies meaning

## Migration Plan

**Not applicable** - No data migration needed. Additive changes only.

**Deployment steps:**
1. Deploy updated scc-service.ts (adds totalLines)
2. Deploy updated calculator.ts (adds absoluteLoc)
3. Deploy updated chat.js (updates display format)
4. Existing sessions continue working with new code

## Open Questions

None - design is finalized based on user requirements (lines, absolute values, trends).
