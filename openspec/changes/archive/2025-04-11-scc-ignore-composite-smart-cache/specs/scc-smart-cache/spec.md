## ADDED Requirements

### Requirement: Change-based cache storage
The system SHALL cache SCC results keyed by directory path with change-based invalidation triggered by agent notifications.

#### Scenario: Cache hit when no changes reported
- **WHEN** SCC is requested for a directory
- **AND** the cache entry is marked as valid
- **THEN** the system SHALL return cached results without running SCC

#### Scenario: Cache miss when changes reported
- **WHEN** SCC is requested for a directory
- **AND** the cache entry is marked as invalid
- **THEN** the system SHALL run SCC
- **AND** update the cache with new results and mark it as valid

### Requirement: Cache invalidation via agent notification
The system SHALL invalidate cache when the agent reports file changes.

#### Scenario: Invalidate cache on agent changes
- **WHEN** `FileSyncService.handleFileChanges()` processes non-empty changes
- **THEN** the system SHALL call `sccService.invalidateCache(agentWorkspacePath)`
- **AND** the cache entry for agent-workspace SHALL be marked as invalid
- **AND** the next SCC request for agent-workspace SHALL execute SCC

#### Scenario: Skip invalidation when no changes
- **WHEN** `FileSyncService.handleFileChanges()` is called with empty changes array
- **THEN** the system SHALL NOT call `sccService.invalidateCache()`
- **AND** the cache SHALL remain valid

### Requirement: Cache persistence
The system SHALL persist cache between server restarts.

#### Scenario: Cache survives restart
- **WHEN** the server restarts
- **THEN** the cache file `.mimo/cache/scc-cache.json` SHALL be loaded
- **AND** cached results from previous sessions SHALL be available
- **AND** the valid/invalid state SHALL be preserved

#### Scenario: Cache atomic writes
- **WHEN** the cache is updated
- **THEN** the system SHALL write to a temporary file first
- **AND** rename it to the final filename atomically
- **AND** prevent cache corruption during write

### Requirement: Optimized cache strategy
The system SHALL apply different caching strategies based on directory type.

#### Scenario: Cache upstream directory
- **WHEN** SCC is run on the upstream directory
- **THEN** the system SHALL check the cache first
- **AND** only run SCC if cache is invalid
- **AND** store results in cache and mark as valid

#### Scenario: Always analyze agent-workspace
- **WHEN** SCC is run on the agent-workspace directory
- **THEN** the system SHALL check if cache is valid
- **AND** if valid, return cached results
- **AND** if invalid, execute SCC and update cache as valid
- **AND** the cache SHALL be invalidated when agent reports changes

### Requirement: Cache storage location
The system SHALL store cache data in the project's `.mimo/cache/` directory.

#### Scenario: Ensure cache directory exists
- **WHEN** SCC service needs to write cache
- **THEN** the system SHALL create `.mimo/cache/` if it doesn't exist
- **AND** use recursive directory creation

#### Scenario: Cache file format
- **WHEN** cache is persisted
- **THEN** it SHALL be stored as JSON at `.mimo/cache/scc-cache.json`
- **AND** the structure SHALL include: directory path, valid flag, SCC metrics, and timestamp

### Requirement: Cache invalidation API
The system SHALL provide mechanisms for cache invalidation.

#### Scenario: Manual cache clear
- **WHEN** a user deletes `.mimo/cache/scc-cache.json`
- **THEN** the system SHALL recreate it on next SCC execution
- **AND** treat all directories as cache misses (invalid)

#### Scenario: Invalidate specific directory cache
- **WHEN** the `invalidateCache(directory)` method is called
- **THEN** that directory's cache entry SHALL be marked as invalid
- **AND** other cached directories SHALL remain unchanged

#### Scenario: Clear cache completely
- **WHEN** the `clearCache()` method is called with no arguments
- **THEN** all cache entries SHALL be removed
- **AND** the cache file SHALL be deleted if it exists

### Requirement: Integration with FileSyncService
The system SHALL integrate SCC cache invalidation with the existing change notification system.

#### Scenario: FileSyncService calls invalidateCache
- **WHEN** agent reports file changes via WebSocket
- **AND** `FileSyncService.handleFileChanges()` processes them
- **THEN** `sccService.invalidateCache(agentWorkspacePath)` SHALL be called
- **AND** the SCC cache SHALL be ready for revalidation on next stats request
