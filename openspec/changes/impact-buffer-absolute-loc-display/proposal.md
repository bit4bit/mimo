## Why

The Lines of Code section in the Impact Buffer currently displays only delta values (e.g., "+450 Added"), which lacks the context provided by absolute values. Users cannot tell if a +400 line change is significant without knowing the total codebase size. The Complexity section already displays absolute values with deltas (e.g., "25→32(+7)"), creating an inconsistent user experience. This change aligns LOC display with the established complexity pattern.

## What Changes

- Add `totalLines` aggregate to SCC metrics (total lines in upstream vs workspace)
- Add `absoluteLoc` structure to ImpactMetrics with total/added/removed breakdown
- Update LOC section display from "+450 Added" format to "1200→1650(+450)" format
- Add trend indicators (↑↓→) for absolute LOC values between refreshes
- Display three LOC metrics: Total, Added, Removed (removing Net metric)

## Capabilities

### New Capabilities

<!-- None - this is a UI refinement of existing impact-buffer capability -->

### Modified Capabilities

- `impact-buffer`: Update LOC display to show absolute values with deltas matching complexity format

## Impact

- **Files Modified:**
  - `packages/mimo-platform/src/domain/impact/scc-service.ts` - Add totalLines aggregate
  - `packages/mimo-platform/src/domain/impact/calculator.ts` - Add absoluteLoc calculation and trend tracking
  - `packages/mimo-platform/public/js/chat.js` - Update LOC display format
- **API Changes:** None - additive changes to internal data structures only
- **Breaking Changes:** None - backwards compatible, new fields are optional
- **Tests:** Update existing impact tests to include absoluteLoc field
