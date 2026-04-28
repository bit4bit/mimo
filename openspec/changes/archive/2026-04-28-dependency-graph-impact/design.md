## Context

The ImpactCalculator currently analyzes code changes via SCC (lines of code, complexity) and JSCPD (duplication). It compares upstream and agent workspace to produce metrics. The calculator already has infrastructure for:
- Running external tools (scc, jscpd)
- Detecting changed files
- Comparing two directory states
- Returning structured metrics

The frontend (`chat.js`) renders impact metrics in sections: Files, Lines of Code, Complexity, Duplication, and Changed Files. Each section is self-contained HTML.

## Goals / Non-Goals

**Goals:**
- Detect new dependencies created by code changes
- Detect dependencies removed by code changes
- Support TypeScript, JavaScript, Python, Elixir import patterns
- Display in tree format similar to `tree` command
- Group files by their directory-level dependency changes
- Integrate seamlessly with existing impact calculation flow

**Non-Goals:**
- Real-time dependency tracking during coding
- Analyzing external package dependencies
- Detecting circular dependencies
- Visual graph rendering (nodes/edges diagram)
- Full AST parsing (regex-based extraction sufficient)

## Decisions

### Decision 1: Parse Only Changed Files

**Choice:** Only parse import statements from new, modified, and deleted files.

**Rationale:** Performance. Parsing entire codebase too slow. Changed files already identified by existing `detectChangedFiles()` function.

**Alternative:** Parse all files in both directories and build complete graphs. Rejected due to performance cost for large codebases.

### Decision 2: Directory-Level Grouping

**Choice:** Group connections by source and target directories, list files underneath.

**Rationale:** High-level view first. Developers care about architectural boundaries (which modules connect), individual files secondary.

**Example:**
```
+ src/components → src/utils
  └── Button.tsx, Form.tsx
```

Not:
```
+ src/components/Button.tsx → src/utils/formatter.ts
+ src/components/Button.tsx → src/utils/validate.ts
+ src/components/Form.tsx → src/utils/formatter.ts
```

### Decision 3: Language-Specific Parsers

**Choice:** Create separate parser functions per language family.

**Rationale:** Import syntax varies significantly. Simple regex sufficient, no need for full AST parsing.

| Language | Patterns |
|----------|----------|
| TS/JS | `import X from "Y"`, `import * as X from "Y"`, `require("Y")` |
| Python | `import X`, `from X import Y` |
| Elixir | `alias X.Y`, `import X.Y`, `use X.Y`, `require X.Y` |

### Decision 4: Module Path Resolution

**Choice:** Treat import targets as-is, resolve relative paths to directory names.

**Rationale:** Exact file paths not needed for directory-level view. `./utils/helper` becomes `src/utils`.

**Edge cases:**
- External packages (node_modules) → skip
- Relative paths → resolve to directory
- Absolute imports (project-specific) → use as-is

### Decision 5: Comparison Strategy

**Choice:** Build dependency sets for both upstream and workspace, then diff.

**Rationale:** Clear way to detect added/removed connections.

**Data structure:**
```typescript
Set<"source|target|filepath"> for each side
Added = workspaceSet - upstreamSet
Removed = upstreamSet - workspaceSet
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Regex parsing misses edge cases | Document limitations, add test cases for each language |
| Dynamic imports not detected | Accept limitation, document in UI |
| Performance on large diffs | Parse only changed files, not entire codebase |
| Alias resolution (webpack/tsconfig paths) | Skip for MVP, future enhancement |
| False positives from commented imports | Basic comment stripping, accept minor false positives |

## Migration Plan

No migration needed. This is additive feature:
1. New calculation runs alongside existing metrics
2. New section appears in ImpactBuffer UI
3. If dependency parsing fails, section shows "Unable to analyze" gracefully
4. No breaking changes to existing API or data structures

## Open Questions

None. Design ready for implementation.
