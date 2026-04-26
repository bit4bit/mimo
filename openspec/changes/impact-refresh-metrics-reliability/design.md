## Context

Impact metrics are computed from multiple steps (SCC scan, changed-file detection, delta/trend calculation, websocket/API delivery). Current behavior allows measurement artifacts and refresh-time variability to influence outputs, which produces conflicting values in the Impact buffer for unchanged code. Existing tests already show instability in trend-related cases.

The change must make impact refresh deterministic without breaking existing payload compatibility. It also needs explicit invariant validation so incorrect values are detected and flagged instead of silently shown.

## Goals / Non-Goals

**Goals:**
- Ensure repeated refreshes on unchanged files return identical file/LOC/complexity metrics.
- Define and enforce invariants between absolute values, delta values, and trends.
- Exclude runtime/generated artifacts from impact inputs.
- Add diagnostic metadata and validation state in refresh responses.
- Add tests that reproduce instability and verify deterministic behavior.

**Non-Goals:**
- Replacing SCC with another complexity engine.
- Redesigning impact UI layout.
- Adding user-configurable metric policies in this change.

## Decisions

### Decision: Use a deterministic input set for each refresh
Refresh computes metrics from an explicit, stable file input set that excludes generated/runtime artifacts. The same include/exclude policy applies to changed-file detection and complexity calculation.

Alternatives considered:
- Keep current recursive scan and only patch edge cases: rejected (fragile and regresses easily).
- Snapshot full filesystem state first: useful but more expensive than needed for this iteration.

### Decision: Add metric invariants and validation state
Server validates key invariants before sending `impact_updated`:
- `complexity.cyclomatic == absoluteComplexity.workspace - absoluteComplexity.upstream`
- `linesOfCode.net == linesOfCode.added - linesOfCode.removed`
- Trend arrows are derived from comparable values and not contradictory.

If violated, response includes a validation warning flag and run metadata for diagnosis.

Alternatives considered:
- Trust computed values without validation: rejected (current issue demonstrates silent inconsistency risk).

### Decision: Preserve backward compatibility with additive response fields
Existing metric fields remain; additive fields carry run metadata and validation diagnostics (for example `runId`, `snapshotHash`, `validation`).

Alternatives considered:
- Replace current payload schema: rejected (breaks clients/tests unnecessarily).

### Decision: Lock deterministic behavior with integration tests
Add tests for repeated forced refresh, invariant consistency, and runtime artifact churn exclusion. Update existing flaky trend tests to use deterministic fixtures and ignore scaffolding.

Alternatives considered:
- Rely only on ad-hoc manual refresh checks: rejected (insufficient regression protection).

## Risks / Trade-offs

- [Risk] Over-excluding files may hide legitimate user changes. → Mitigation: limit exclusions to known generated/runtime paths and document policy.
- [Risk] Added validation may surface warnings in existing environments. → Mitigation: keep warnings additive and non-breaking.
- [Risk] Tight deterministic assertions can expose pre-existing flaky tests. → Mitigation: normalize fixtures and isolate external side effects in tests.
