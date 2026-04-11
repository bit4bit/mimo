## Why

SCC (Sloc Cloc and Code) currently scans all files including external libraries like node_modules, .git, and vendor directories. This produces inaccurate code statistics by including third-party dependencies. Additionally, SCC re-runs on every request with a simple time-based cache (5 seconds TTL), which is inefficient when no actual changes have occurred. We need a smarter system that:

1. Respects ignore patterns from multiple sources (.fossil-settings/ignore-glob, .gitignore, and a new .mimoignore)
2. Only executes SCC when the mimo-agent reports actual file changes via WebSocket (FileSyncService.handleFileChanges)
3. Caches results and invalidates the cache only when changes are reported by the agent
4. Optimizes execution by caching the upstream directory (which rarely changes) while always analyzing agent-workspace (which changes frequently)

## What Changes

- Create composite ignore file system that combines `.fossil-settings/ignore-glob`, `.gitignore`, and `.mimoignore` into a single file at `.mimo/cache/scc-ignore-combined.txt`
- Add comments to the composite file indicating the source of each ignore pattern
- Log warnings when source ignore files are missing (non-fatal)
- Implement change-based smart cache that stores results in `.mimo/cache/scc-cache.json`
- Cache invalidation triggered by WebSocket messages from agent via `FileSyncService.handleFileChanges()`
- Optimize cache strategy: cache upstream directory results, always run SCC on agent-workspace
- Modify `SccService` class to use composite ignore file via `--ignore` flag
- Replace time-based cache (TTL) with change-based invalidation
- Add `invalidateCache(directory: string)` method to SccService for FileSyncService to call

## Capabilities

### New Capabilities
- `scc-ignore-composite`: Composite ignore file generation that merges multiple ignore sources for accurate code statistics
- `scc-smart-cache`: Intelligent caching system that invalidates only when agent reports changes via WebSocket

### Modified Capabilities
- `scc-service`: Existing SCC service will be modified to support composite ignore files and smart caching (implementation changes only, no API changes)

## Impact

- **Files Modified**:
  - `packages/mimo-platform/src/impact/scc-service.ts` - Core SCC service with cache invalidation
  - `packages/mimo-platform/src/sync/service.ts` - FileSyncService to call invalidateCache on changes
  - `packages/mimo-platform/test/scc-ignore.test.ts` - New test file for ignore functionality
  - `packages/mimo-platform/test/scc-cache.test.ts` - New test file for cache functionality
  
- **New Files Created**:
  - `.mimoignore` - Project-specific ignore patterns (template/example)
  
- **Cache Directory**: `.mimo/cache/` will store composite ignore file and cache metadata

- **Behavior Changes**:
  - SCC will now exclude files matching patterns in .fossil-settings/ignore-glob, .gitignore, and .mimoignore
  - Cache will persist between server restarts (previously in-memory only)
  - Statistics will only update when agent reports changes via WebSocket
  - SCC execution is now triggered by change notifications, not by polling/statistics requests

- **Performance**: Reduced SCC execution time for unchanged directories; more accurate code metrics

- **Breaking Changes**: None - existing APIs remain compatible
