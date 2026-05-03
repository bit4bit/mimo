## 1. Data Model Changes

- [x] 1.1 Add `totalLines` aggregate to `SccMetrics` interface in `scc-service.ts`
- [x] 1.2 Update `SccMetrics` to include `totalLines: { upstream: number; workspace: number }`
- [x] 1.3 Add `absoluteLoc` structure to `ImpactMetrics` interface in `calculator.ts`
- [x] 1.4 Extend `ImpactTrend` interface to include `absoluteLoc` with `total`, `added`, `removed` properties
- [x] 1.5 Extend `PreviousState` interface to store `absoluteLoc` values for trend calculation

## 2. SCC Service Implementation

- [x] 2.1 Implement aggregate calculation in `parseSccOutput()` to compute total lines
- [x] 2.2 Sum `lines` property from all files in `byFile` array for total
- [x] 2.3 Populate `totalLines.upstream` and `totalLines.workspace` in returned metrics

## 3. Impact Calculator Implementation

- [x] 3.1 Extract total lines from SCC metrics in `calculateImpact()` method
- [x] 3.2 Compute `absoluteLoc` structure with total/added/removed values
- [x] 3.3 Set `absoluteLoc.total` from SCC `totalLines` aggregate
- [x] 3.4 Set `absoluteLoc.added` with upstream=0, workspace=linesAdded
- [x] 3.5 Set `absoluteLoc.removed` with upstream=0, workspace=linesRemoved
- [x] 3.6 Include `absoluteLoc` in returned `ImpactMetrics` object
- [x] 3.7 Update `PreviousState` storage to include `absoluteLoc` values
- [x] 3.8 Implement trend calculation for `absoluteLoc` in `calculateTrends()` method

## 4. UI Updates

- [x] 4.1 Update `renderImpactMetrics()` in `chat.js` to extract `absoluteLoc` from metrics
- [x] 4.2 Compute display strings for Total, Added, Removed in `upstream→workspace(delta)` format
- [x] 4.3 Extract `absoluteLocTrend` from trends parameter
- [x] 4.4 Replace LOC section HTML template to show Total, Added, Removed (remove Net)
- [x] 4.5 Add trend arrows for each LOC metric
- [x] 4.6 Use safe defaults: `metrics.absoluteLoc?.total?.upstream ?? 0`

## 5. Testing

- [x] 5.1 Add unit tests for `SccService` totalLines aggregate calculation
- [x] 5.2 Add unit tests for `ImpactCalculator` absoluteLoc computation
- [x] 5.3 Add tests for absoluteLoc trend calculation (increase, decrease, stable)
- [x] 5.4 Update existing impact tests to include absoluteLoc in assertions
- [x] 5.5 Update mock data to include absoluteLoc values
- [ ] 5.6 Run full impact test suite to verify no regressions
- [ ] 5.7 Manual verification: verify LOC section displays correctly in browser

## 6. Verification

- [ ] 6.1 Verify Total LOC shows `upstream→workspace(delta)` format
- [ ] 6.2 Verify Added LOC shows `0→workspace(delta)` format
- [ ] 6.3 Verify Removed LOC shows `0→workspace(delta)` format
- [ ] 6.4 Verify trend arrows display correctly for each metric
- [ ] 6.5 Verify consistency with Complexity section display format
