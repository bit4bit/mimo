## Why

Impact buffer refresh currently produces inconsistent metrics for the same code state, including mismatched complexity displays and unstable file/LOC values. This erodes user trust and makes impact data unreliable for decision-making.

## What Changes

- Define deterministic refresh behavior for impact metrics so repeated refreshes with unchanged content return identical results.
- Define metric invariants for complexity and delta presentation (absolute, delta, and trend must agree).
- Exclude runtime/generated measurement artifacts from impact file counting and LOC/complexity calculations.
- Add reliability diagnostics and explicit invalid-run handling when invariants are violated.
- Add integration tests that reproduce refresh instability and lock deterministic behavior.

## Capabilities

### New Capabilities
- `impact-metrics-reliability`: Deterministic impact refresh contract, invariants, and validation behavior for files, LOC, and complexity outputs.

### Modified Capabilities
- None.

## Impact

- Affected areas: `packages/mimo-platform/src/impact/*`, `packages/mimo-platform/src/files/changed-files.ts`, impact refresh wiring in websocket/session routes, and impact UI rendering path.
- Test impact: new and updated tests in `packages/mimo-platform/test/*impact*` and related refresh/route tests.
- API impact: additive response fields for validation/run metadata; existing fields remain backward compatible.
