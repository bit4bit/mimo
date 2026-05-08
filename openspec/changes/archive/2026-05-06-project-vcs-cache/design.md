## Context

Currently, every session creation performs a full VCS clone from the remote repository. For large repositories (1GB+), this takes several minutes. The session creation flow in `sessions.tsx` calls `vcs.cloneRepository()` which executes `git clone` or `fossil clone` from the remote URL every time.

The architecture uses:

- `VCS` class for Git/Fossil operations (injected with OS interface)
- Projects stored in `/mimo/projects/{id}/` with metadata only
- Sessions create their own `upstream/` directory on creation
- Fossil is used as an intermediate for Git projects (import to `.fossil` file)

## Goals / Non-Goals

**Goals:**

- Reduce session creation time from minutes to seconds for large repositories
- Support both Git and Fossil repositories
- Maintain cache freshness via eager fetch on every session creation
- Clean abstraction that doesn't leak VCS implementation details

**Non-Goals:**

- Background sync or periodic cache updates
- Cache eviction policies (manual clear only)
- Multi-tenant cache sharing across projects
- Support for VCS types beyond Git and Fossil

## Decisions

### Decision: Bare Repository Cache for Git

**Choice:** Use bare git repositories (`--bare`) at project level, clone using `--reference`

**Rationale:**

- Bare repos are smaller (no checkout, no `.git` directory overhead)
- `--reference` shares objects without copying, enabling fast clones
- Standard git feature, well-supported

**Alternative considered:** Full clone with `--shared` or hard links

- Rejected: `--reference` is cleaner and doesn't tie session lifecycle to cache

### Decision: Single Fossil File Cache for Fossil

**Choice:** Keep a `.fossil` file at project level, use `fossil sync` for updates

**Rationale:**

- Fossil is already a single-file database, perfect for caching
- `fossil sync` efficiently transfers compressed deltas
- `fossil open` creates checkout instantly from cache

**Alternative considered:** Clone fossil to session then copy

- Rejected: Fossil's native sync is more efficient than file copying

### Decision: Eager Fetch on Every Session Creation

**Choice:** Refresh cache synchronously before cloning for each session

**Rationale:**

- Ensures cache is never stale (addresses user requirement)
- `git fetch` and `fossil sync` are fast operations (delta transfer)
- Simpler than background sync or complex staleness detection

**Alternative considered:** Lazy refresh (only when stale)

- Rejected: User explicitly requested eager fetch

### Decision: Project-Scoped Cache Location

**Choice:** Cache stored at `/mimo/projects/{id}/cache.git/` (Git) or `cache.fossil` (Fossil)

**Rationale:**

- Natural location alongside project metadata
- Easy to clear when project is deleted
- No cross-project pollution

### Decision: Abstraction with Engine Pattern

**Choice:** `ProjectVcsCache` interface with `GitCacheEngine` and `FossilCacheEngine` implementations

**Rationale:**

- Clean separation between abstraction and VCS-specific logic
- Easy to test with mock engines
- Can add new VCS types without changing interface

**Alternative considered:** Extend existing `VCS` class with caching

- Rejected: Would mix concerns; VCS class is for session-level operations, cache is project-level

## Risks / Trade-offs

| Risk                         | Mitigation                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Cache corruption             | Validate with `git fsck` / `fossil verify` before use; auto-clear and re-clone on corruption |
| Concurrent access            | File locking on cache operations; git operations are generally safe for concurrent reads     |
| Storage increase             | Cache is additive (not duplicative); one cache per project regardless of session count       |
| First session still slow     | Pre-warm cache on project creation (optional)                                                |
| Auth failures during refresh | Same credential handling as current; clear cache if auth fails (force re-auth)               |

## Migration Plan

**Deployment:**

1. Deploy code with cache abstraction
2. Cache created lazily on first session creation
3. Existing sessions unaffected

**Rollback:**

- Feature flag to disable cache (fallback to direct clone)
- Cache files can be safely deleted anytime

## Open Questions

None at this time.
