# Incident Report: Session Creation Failure Due to Fossil Checkout File in Repository

## Summary
Session creation was failing with error: `Fossil open failed: repository does not exist or is in an unreadable directory: /home/bit4bit/.mimo/projects/c39c27ad-b243-405f-92bf-f747ff8c2dd1/sessions/a02895a9-24a3-475e-890b-7ea6b369da78/upstream/../repo.fossil`

**Severity**: High - Core functionality (session creation) was completely broken  
**Duration**: Intermittent failures since project `c39c27ad-b243-405f-92bf-f747ff8c2dd1` was created  
**Resolution**: Removed `.fslckout` from git repository and added to `.gitignore`

## Timeline

- **April 5, 2026**: Project `c39c27ad-b243-405f-92bf-f747ff8c2dd1` created with broken fossil state
- **April 8, 2026 20:17**: `.fslckout` accidentally committed to repository (commit `796655b`)
- **April 8, 2026 23:57**: Issue reported - session creation failing consistently
- **April 9, 2026 00:12**: Root cause identified - `.fslckout` contains hardcoded path
- **April 9, 2026 00:15**: Fix deployed - removed `.fslckout` from git and added to `.gitignore`

## Problem

When creating a new session in project `f1ba25e5-003f-455d-8340-e93b32fc7c84`, the system:
1. Created session directory and upstream path
2. Successfully cloned GitHub repository (`git@github.com:bit4bit/mimo.git`) to upstream/
3. **Failed at `fossil open`** with error referencing a completely different project (`c39c27ad.../a02895a9...`)

The error message referenced paths that didn't exist, suggesting stale/cached state.

## Root Cause

The `.fslckout` file was accidentally committed to the GitHub repository at some point. This file:

1. **Is a Fossil working directory marker** (similar to `.git/` for Git)
2. **Contains hardcoded absolute paths** to the original repository location
3. **Was being cloned with every new session**, bringing the stale checkout configuration

The `.fslckout` in the upstream directory contained:
```
repository /home/bit4bit/.mimo/projects/c39c27ad-b243-405f-92bf-f747ff8c2dd1/sessions/a02895a9-24a3-475e-890b-7ea6b369da78/upstream/../repo.fossil
```

When `fossil open` ran, it found this `.fslckout` and tried to use the hardcoded (non-existent) repository path instead of the newly created `repo.fossil`.

## Investigation

Key debugging steps:
1. Confirmed `.fslckout` existed in freshly cloned upstream directory
2. Ran `fossil status` - returned error referencing wrong project path
3. Inspected `.fslckout` with `strings` - found hardcoded absolute path
4. Checked git history - `.fslckout` was committed in commit `796655b`

## Solution

1. **Immediate fix**: Remove `.fslckout` from repository:
   ```bash
   git rm .fslckout
   echo ".fslckout" >> .gitignore
   git commit -m "Remove .fslckout from repo and add to .gitignore"
   git push
   ```

2. **Prevention**: Added `.fslckout` to `.gitignore` to prevent future accidental commits

## Impact

- **Affected**: All new session creation attempts using the mimo repository
- **Duration**: From commit `796655b` until fix deployment (~4.5 hours)
- **Data loss**: None - existing sessions and data unaffected
- **Recovery**: Immediate once fix was pushed to GitHub

## Lessons Learned

1. **Fossil checkout files (`.fslckout`) should never be committed** - they're working directory state
2. **Files that shouldn't be committed need to be in `.gitignore` proactively**
3. **Debugging technique**: The error message referenced a different project ID - this was the clue that something was caching old state
4. **VCS tool behavior**: Fossil searches for `.fslckout` in the current directory and parents, using the first one found

## Prevention

- `.fslckout` added to `.gitignore`
- Consider adding other VCS tool working directory files (`.svn`, `_FOSSIL_`, etc.) to `.gitignore`
- Review repository for other files that shouldn't be tracked

## References

- Commit with fix: `9330e66`
- Erroneous commit: `796655b` ("Mimo commit at 2026-04-08T20:17:56.938Z")
- Related: Fossil documentation on checkout files and repository opening behavior

---

# Incident Report: Shared Fossil Server Not Starting

## Summary
The shared fossil server was not starting because the `reposDir` configuration was being passed as an empty string when the `FOSSIL_REPOS_DIR` environment variable was not set. Additionally, the `SharedFossilServer` class was violating dependency injection principles by directly accessing `process.env.MIMO_HOME`.

**Severity**: High - Agent synchronization would be unavailable without the fossil server  
**Duration**: Present since the shared fossil server was introduced  
**Resolution**: Fixed empty string handling, made `reposDir` required, removed environment variable access from server class

## Timeline

- **April 15, 2026**: Issue reported - shared fossil server not starting
- **April 15, 2026**: Investigation identified root cause: empty string `reposDir` not falling back to default
- **April 15, 2026**: Additional issue discovered: `SharedFossilServer` reading `process.env.MIMO_HOME` directly
- **April 15, 2026**: Fix deployed - updated constructor validation, path resolution moved to injection point

## Problem

When the mimo-platform started, the shared fossil server failed to initialize because:

1. `index.tsx` used `process.env.FOSSIL_REPOS_DIR ?? ""` which resulted in an empty string when the env var wasn't set
2. The `SharedFossilServer` constructor used `config.reposDir ?? join(...)` which doesn't treat empty strings as falsy
3. The server also directly accessed `process.env.MIMO_HOME` for its fallback path

This resulted in `reposDir` being ` ""` (empty string), causing the fossil server to fail silently or behave unexpectedly.

## Root Cause

1. **Empty string not treated as falsy**: The nullish coalescing operator (`??`) only treats `null` and `undefined` as falsy, not empty strings
2. **Environment variable access in class**: The `SharedFossilServer` class directly accessed `process.env.MIMO_HOME`, violating dependency injection principles
3. **Path resolution happening at wrong layer**: Default path construction should happen at the composition root, not inside the service

## Investigation

Key debugging steps:
1. Traced the code path from `index.tsx` → `createSharedFossilServer()` → `SharedFossilServer` constructor
2. Discovered that `FOSSIL_REPOS_DIR: process.env.FOSSIL_REPOS_DIR ?? ""` passed empty string
3. Found that `config.reposDir ?? join(...)` kept the empty string
4. Identified additional issue: `DummySharedFossilServer` also accessing `process.env.MIMO_HOME`

## Solution

1. **Made `reposDir` required**: Changed `SharedFossilServerConfig.reposDir` from optional (`?`) to required
2. **Added validation**: Constructor now throws if `reposDir` is not a non-empty string
3. **Removed env access**: Both `SharedFossilServer` and `DummySharedFossilServer` no longer read environment variables
4. **Moved path resolution**: `index.tsx` now resolves `mimoHome` and `fossilReposDir` before creating services

### Code Changes

**`src/vcs/shared-fossil-server.ts`**:
```typescript
// Before: reposDir was optional with env fallback
export interface SharedFossilServerConfig {
  port: number;
  reposDir?: string;  // Optional - had fallback
}

constructor(config: SharedFossilServerConfig) {
  this._reposDir =
    config.reposDir ?? join(process.env.MIMO_HOME || "", "session-fossils");
}

// After: reposDir is required, no env access
export interface SharedFossilServerConfig {
  port: number;
  reposDir: string;  // Required - must be injected
}

constructor(config: SharedFossilServerConfig) {
  if (typeof config.reposDir !== "string" || config.reposDir.length === 0) {
    throw new Error("reposDir is required");
  }
  this._reposDir = config.reposDir;  // Use provided value
}
```

**`src/index.tsx`**:
```typescript
// Before: env access scattered, empty string fallback
const sharedFossilServer = createSharedFossilServer({
  FOSSIL_REPOS_DIR: process.env.FOSSIL_REPOS_DIR ?? "",  // Empty string!
  // ...
});

// After: paths resolved at composition root
const mimoHome = process.env.MIMO_HOME ?? join(homedir(), ".mimo");
const fossilReposDir = process.env.FOSSIL_REPOS_DIR ?? join(mimoHome, "session-fossils");

const sharedFossilServer = createSharedFossilServer({
  FOSSIL_REPOS_DIR: fossilReposDir,  // Properly resolved path
  // ...
});
```

## Impact

- **Affected**: New deployments where `FOSSIL_REPOS_DIR` env var was not set
- **Duration**: From introduction of shared fossil server until fix
- **Data loss**: None - fossil server would fail to start, not corrupt data
- **Recovery**: Set `FOSSIL_REPOS_DIR` environment variable as workaround; permanent fix deployed

## Lessons Learned

1. **Use `||` not `??` for string defaults**: Empty strings need to be treated as falsy for default values
2. **Never access env vars inside service classes**: All configuration should be injected at the composition root
3. **Validate required parameters**: Constructor should throw early with clear messages for missing required config
4. **Dependency injection is a boundary**: Services receive fully-resolved values, not environment references

## Prevention

- `reposDir` is now required in `SharedFossilServerConfig`
- Validation ensures reposDir is non-empty string
- Environment variable access moved to `index.tsx` (composition root)
- Tests added to verify proper injection behavior

## References

- Files modified: `src/vcs/shared-fossil-server.ts`, `src/index.tsx`, `src/context/mimo-context.ts`, `test/shared-fossil-server.test.ts`
