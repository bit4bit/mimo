## Why

The ImpactBuffer currently shows code metrics (files changed, LOC, complexity, duplication) but provides no visibility into how code changes affect module dependencies. When developers refactor or add features, they need to see if new directory-to-directory or file-to-file dependencies are being created or removed, as these changes can have long-term architectural implications.

## What Changes

- Add a "Dependency Changes" section to the ImpactBuffer component
- Extend ImpactCalculator to analyze import/require statements across changed files
- Support parsing dependencies for TypeScript, JavaScript, Python, and Elixir
- Compare upstream vs workspace dependency graphs to detect added/removed connections
- Display changes in tree format showing:
  - `+ source → target` for new dependencies
  `- source → target` for removed dependencies
  - Changed files grouped under each connection

## Capabilities

### New Capabilities

- `dependency-change-detection`: Detect and report changes in code dependencies between directories and files when comparing upstream vs agent workspace

### Modified Capabilities

- None (this extends existing impact calculation without changing core behavior)

## Impact

- **Backend**: `ImpactCalculator` class in `src/impact/calculator.ts` - add new calculation method
- **Frontend**: `public/js/chat.js` - add `renderDependencyChanges()` function
- **Types**: Extend `ImpactMetrics` interface with dependency data
- **Tests**: Add tests for dependency parsing across supported languages
