## 1. Deterministic Metric Inputs

- [x] 1.1 Define and centralize include/exclude rules for impact-relevant files.
- [x] 1.2 Apply the same file filtering policy to changed-file detection and SCC-driven impact calculation.
- [x] 1.3 Add tests proving runtime/generated artifacts do not alter impact values.

## 2. Invariant Validation and Response Metadata

- [x] 2.1 Implement invariant checks for complexity delta and LOC net values before emitting impact updates.
- [x] 2.2 Add additive response fields for run metadata and validation status.
- [x] 2.3 Add tests that assert invariant-consistent payloads and warning behavior on validation failure.

## 3. Refresh and Trend Reliability

- [x] 3.1 Ensure repeated force refresh with unchanged content returns identical metrics.
- [x] 3.2 Harden trend calculation expectations to avoid contradictory stable/increase states.
- [x] 3.3 Update existing flaky impact trend tests to deterministic fixtures and expected outputs.

## 4. Verification

- [x] 4.1 Run targeted impact reliability suite (`bun test test/impact-refresh-stability.test.ts` and related impact tests).
- [x] 4.2 Run full `packages/mimo-platform` unit tests and confirm no regressions.
- [x] 4.3 Document operator-facing troubleshooting notes for impact validation warnings.
