## Context

The current SCC (Sloc Cloc and Code) integration in mimo-platform has two main issues:

1. **No ignore file support**: SCC scans all files including external dependencies (node_modules, .git, vendor), producing inflated and inaccurate code statistics
2. **Inefficient caching**: Uses a 5-second TTL in-memory cache that expires regardless of whether files actually changed, causing unnecessary SCC executions

The SCC binary supports the `--ignore` flag which accepts a file containing ignore patterns in .gitignore syntax. We need to build a composite ignore file from three sources to respect existing project configurations while adding MIMO-specific patterns.

For caching, we need a change-based invalidation mechanism. The mimo-agent already reports file changes to the platform via WebSocket messages that are processed by `FileSyncService.handleFileChanges()`. We will integrate cache invalidation into this existing flow.

```
┌─────────────────────────────────────────────────────────────────────┐
│           CURRENT CHANGE NOTIFICATION FLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Agent Workspace              Platform                             │
│        │                            │                               │
│        │ 1. File changes           │                               │
│        │    (create/modify/delete) │                               │
│        ▼                            │                               │
│   ┌─────────┐                       │                               │
│   │  Agent  │───WebSocket────────────▶│                               │
│   │ Process │  notify changes         │                               │
│   └─────────┘                       │                               │
│                                     ▼                               │
│                            FileSyncService                          │
│                            .handleFileChanges()                     │
│                                     │                               │
│                                     ▼                               │
│                            Change tracking updated                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

We will extend this flow to invalidate the SCC cache when changes are detected.

## Goals / Non-Goals

**Goals:**
- Combine `.fossil-settings/ignore-glob`, `.gitignore`, and `.mimoignore` into a single composite file
- Generate composite ignore file at `.mimo/cache/scc-ignore-combined.txt` with source annotations
- Implement change-based cache in `.mimo/cache/scc-cache.json`
- Invalidate cache when `FileSyncService.handleFileChanges()` processes non-empty changes
- Optimize execution: cache upstream results, always analyze agent-workspace
- Maintain backward compatibility with existing SCC APIs

**Non-Goals:**
- File watching (inotify/fsevents) - using agent notification instead
- Content-based hashing or mtime polling - using explicit change notifications
- Modifying how ImpactCalculator calculates diffs (only SCC execution optimization)
- Supporting ignore syntax variations beyond standard gitignore glob patterns
- Real-time statistics updates - SCC runs on demand when cache is invalid

## Decisions

### Decision 1: Composite Ignore File Location
**Choice**: Save at `.mimo/cache/scc-ignore-combined.txt`

**Rationale**:
- Keeps cache-related files together in `.mimo/cache/`
- Automatically excluded from version control (`.mimo/` should be gitignored)
- Easy to debug by inspecting the generated file
- Can be reused across multiple SCC invocations in the same session

**Alternatives considered**:
- `/tmp/mimo-scc-ignore-{hash}.txt` - harder to debug, OS-specific
- In-memory pipe - not supported by SCC binary (requires file path)

### Decision 2: Cache Invalidation Strategy
**Choice**: Invalidate via `FileSyncService.handleFileChanges()` when non-empty changes are processed

**Rationale**:
- Agent already reports all changes via WebSocket
- `FileSyncService` already tracks changes in sync state
- No additional polling or watching needed
- Precise invalidation exactly when changes occur

**Flow**:
```
handleFileChanges(changes):
  if changes.length > 0:
    process changes
    sccService.invalidateCache(agentWorkspacePath)
```

**Alternatives considered**:
- mtime-based polling - wasteful, agent already informs us
- File system watching - unnecessary complexity, agent reports changes
- Always run SCC - defeats the purpose of caching

### Decision 3: Cache Strategy
**Choice**: Cache upstream directory only, always run on agent-workspace

**Rationale**:
- `upstream` is the repository base state - rarely changes (only on explicit sync)
- `agent-workspace` contains active changes - constantly changing during development
- Caching upstream saves ~50% of SCC executions
- agent-workspace cache invalidation handled by change notifications

**Alternatives considered**:
- Cache both directories - agent-workspace cache would be invalidated constantly
- No cache - wastes time re-scanning unchanged upstream
- Per-file cache - too complex, directory-level is sufficient

### Decision 4: Cache Storage Format
**Choice**: JSON file at `.mimo/cache/scc-cache.json`

**Structure**:
```json
{
  "entries": {
    "/path/to/upstream": {
      "valid": true,
      "data": { /* SccMetrics */ },
      "cachedAt": 1234567890
    },
    "/path/to/agent-workspace": {
      "valid": false,
      "data": null,
      "cachedAt": 1234567890
    }
  }
}
```

**Rationale**:
- Human-readable for debugging
- Easy to inspect and clear manually
- `valid` flag supports invalidation without deletion
- Atomic writes (write to temp, rename) prevent corruption

**Alternatives considered**:
- Keep in-memory only - lost on restart
- SQLite - overkill for simple key-value cache
- Binary format - harder to debug

### Decision 5: Ignore File Combination Order
**Choice**: `.fossil-settings/ignore-glob` → `.gitignore` → `.mimoignore`

**Rationale**:
- Follows precedence: project defaults (Fossil) → version control ignores → MIMO-specific
- Later files can override earlier ones if needed
- Matches typical developer expectations

**Alternatives considered**:
- Reverse order - confusing, .mimoignore should have final say
- Alphabetical - no semantic meaning

### Decision 6: Handling Missing Source Files
**Choice**: Log warning, continue with available files

**Rationale**:
- Not all projects use all three systems
- Should work with just `.gitignore` (most common)
- Warnings help developers understand what's being used
- Non-fatal - graceful degradation

**Alternatives considered**:
- Fail hard - too restrictive
- Silent skip - harder to debug why ignores aren't working

## Risks / Trade-offs

**Risk**: Cache might not be invalidated if agent fails to report changes
**Mitigation**: Agent change reporting is core functionality, failures would affect sync anyway. Cache clear method available for manual intervention.

**Risk**: Cache file corruption during concurrent writes
**Mitigation**: Use atomic write pattern (write to temp file, rename). Cache writes are typically sequential per session.

**Risk**: Different ignore syntax between Fossil and Git
**Mitigation**: Both use glob patterns with similar syntax. SCC handles the parsing. Document that complex patterns should follow gitignore syntax.

**Risk**: Stale cache if `invalidateCache` is not called
**Mitigation**: `FileSyncService` integration is straightforward. Add integration test to verify invalidation happens on changes.

**Trade-off**: Agent must report changes for cache to work correctly
**Acceptance**: This is existing behavior - agent already reports changes. Cache is an optimization, correctness depends on existing sync mechanism.

## Open Questions

1. **Manual cache clear**: Should we expose an API endpoint to manually clear SCC cache? Useful for debugging. (Decision: Add to SccService for now, can expose via API if needed)

2. **Cache for multiple sessions**: Current design uses one cache file. Should we namespace by session ID? (Decision: Directory paths are unique, sufficient for now)
