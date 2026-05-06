## 1. Core Abstraction

- [x] 1.1 Create `CacheEngine` internal interface in `src/domain/projects/vcs-cache.ts`
- [x] 1.2 Create `ProjectVcsCache` public interface with `clone()`, `refresh()`, `clear()` methods
- [x] 1.3 Define `CloneParams`, `RefreshParams` types with proper typing

## 2. Git Cache Engine Implementation

- [x] 2.1 Create `GitCacheEngine` class implementing `CacheEngine`
- [x] 2.2 Implement `refresh()` method with bare clone and fetch logic
- [x] 2.3 Implement `cloneFromCache()` method using `--reference` for fast cloning
- [x] 2.4 Implement `clear()` method to remove `cache.git/` directory
- [x] 2.5 Add cache corruption detection using `git fsck`

## 3. Fossil Cache Engine Implementation

- [x] 3.1 Create `FossilCacheEngine` class implementing `CacheEngine`
- [x] 3.2 Implement `refresh()` method with clone and sync logic
- [x] 3.3 Implement `cloneFromCache()` method using `fossil open`
- [x] 3.4 Implement `clear()` method to remove `cache.fossil` file
- [x] 3.5 Add cache corruption detection using `fossil verify`

## 4. Factory and Wiring

- [x] 4.1 Create `createProjectVcsCache()` factory function with engine selection
- [x] 4.2 Inject VCS instance and OS into cache for command execution
- [x] 4.3 Add `projectVcsCache` field to `MimoContext` interface
- [x] 4.4 Initialize `projectVcsCache` in MimoContext factory
- [x] 4.5 Add cache path helper: `/mimo/projects/{id}/cache.git` or `cache.fossil`

## 5. Session Creation Integration

- [x] 5.1 Update session creation route in `sessions.tsx` to use `projectVcsCache.clone()`
- [x] 5.2 Remove direct `vcs.cloneRepository()` call from session creation
- [x] 5.3 Pass all required parameters: projectId, repoUrl, repoType, targetPath, credential, branch
- [x] 5.4 Handle cache errors appropriately (fallback or clear and retry)

## 6. Error Handling and Recovery

- [x] 6.1 Implement automatic cache clear and re-clone on corruption detection
- [x] 6.2 Add logging for cache operations (refresh, clone, clear, corruption)
- [x] 6.3 Handle authentication failures during cache refresh
- [x] 6.4 Handle concurrent access to cache (file locking if needed)

## 7. Project Cleanup

- [x] 7.1 Update project deletion to clear VCS cache
- [x] 7.2 Remove `cache.git/` when Git project is deleted
- [x] 7.3 Remove `cache.fossil` when Fossil project is deleted

## 8. Testing

- [x] 8.1 Unit tests for `GitCacheEngine` (refresh, clone, clear, corruption)
- [x] 8.2 Unit tests for `FossilCacheEngine` (refresh, clone, clear, corruption)
- [x] 8.3 Integration tests for full session creation with cache
- [ ] 8.4 Performance test: verify <10s clone for 1GB repository
- [x] 8.5 Test cache recovery from corruption
- [ ] 8.6 Test concurrent session creation (same project)

## 9. Optional: Pre-warm Cache

- [x] 9.1 Add optional cache refresh on project creation
- [x] 9.2 Make pre-warming async and non-blocking
- [x] 9.3 Handle pre-warm failures gracefully (don't fail project creation)
