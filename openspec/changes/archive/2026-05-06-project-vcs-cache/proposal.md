## Why

Currently, every session creation performs a full clone from the remote VCS repository. For large repositories, this takes several minutes, creating a poor user experience when starting new work. We need a caching mechanism that stores a local project-level copy of the repository and refreshes it on each session creation, enabling fast clones from the cache instead of the remote.

## What Changes

- **New**: Project-level VCS cache abstraction (`ProjectVcsCache`) that maintains a local copy of the repository
- **New**: Git cache engine using bare repositories and `--reference` cloning
- **New**: Fossil cache engine using fossil sync/open operations
- **Modified**: Session creation flow to clone from cache instead of remote (with eager fetch)
- **Modified**: Project initialization to optionally pre-warm the cache

## Capabilities

### New Capabilities
- `project-vcs-cache`: Project-level repository caching for fast session creation with Git and Fossil support

### Modified Capabilities
- None - this is an internal optimization that doesn't change external behavior

## Impact

- **Domain**: New `ProjectVcsCache` abstraction in `src/domain/projects/`
- **Infrastructure**: `MimoContext` extended with `projectVcsCache` dependency
- **Web Routes**: Session creation in `sessions.tsx` updated to use cache
- **Performance**: Session creation time drops from minutes to seconds for large repositories
- **Storage**: Additional disk usage for project-level cache (one cache per project)
