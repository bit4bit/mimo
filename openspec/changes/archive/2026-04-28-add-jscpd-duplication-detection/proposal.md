## Why

When using AI agents for code generation, duplication is a common side effect—agents may generate similar boilerplate, copy-paste existing patterns, or create utilities that already exist. Currently, the Impact Buffer shows code metrics (lines, complexity) but has no visibility into code duplication. This makes it impossible to detect when an agent session is introducing technical debt through copy-paste coding. Adding duplication detection will provide immediate feedback on code quality and prevent accumulation of duplicated code.

## What Changes

- Add a new `JscpdService` following the existing `SccService` pattern
- Extend `ImpactCalculator` to calculate duplication deltas (workspace - upstream)
- Extend `ImpactMetrics` with a new `duplication` field containing:
  - Total duplicated lines and tokens
  - Percentage of changed code that is duplicated
  - List of duplicate blocks with file locations
  - Separation of cross-file and intra-file duplicates
- Extend `ImpactBuffer` UI to display duplication metrics as a first-class section
- Add auto-commit integration to warn/block commits with high duplication
- Run jscpd only on changed files for performance optimization

## Capabilities

### New Capabilities
- `jscpd-duplication-detection`: Code duplication detection using jscpd, showing duplicate blocks introduced by agent changes with cross-file and intra-file breakdown

### Modified Capabilities
- `frame-buffers`: Extend Impact Buffer to display duplication metrics alongside existing SCC metrics

## Impact

- New service: `packages/mimo-platform/src/impact/jscpd-service.ts`
- Modified: `packages/mimo-platform/src/impact/calculator.ts` (add duplication calculation)
- Modified: `packages/mimo-platform/src/components/ImpactBuffer.tsx` (add duplication UI section)
- Modified: `packages/mimo-platform/src/sync/service.ts` (add duplication checks to auto-commit)
- New dependency: jscpd (npm package `@jscpd/core` or CLI binary)
- No breaking changes to existing APIs
