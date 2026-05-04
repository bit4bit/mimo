## Context

Today, the knowledge of "which paths are invisible system machinery" is scattered across at least four locations:

- `domain/vcs/index.ts`: `VCS_INTERNALS` (a `Set`) and `VCS_METADATA` (an array) for Fossil/Git internals.
- `domain/files/impact-file-policy.ts`: `IMPACT_EXCLUDED_PATHS` and `IMPACT_EXCLUDED_PATH_PREFIXES` for impact analysis.
- `domain/files/changed-files.ts`: Uses `VCS_INTERNALS` for change detection.
- `domain/files/service.ts`: `DEFAULT_IGNORE_PATTERNS` with only `.mimo-patches/`, so the file finder shows `.git/`, `.fossil-settings/`, `.fslckout`, and other internals unless they happen to be listed in `.gitignore`.

The file finder is the clearest symptom: it does not exclude VCS folders, so a user browsing files will see `.git/config`, `.fossil-settings/ignore-glob`, etc. The fix is to extract one canonical list and one predicate so every subsystem agrees.

## Goals / Non-Goals

**Goals:**
- One module (`domain/files/path-policy.ts`) owns the canonical list of excluded paths.
- One pure function `isExcluded(path)` decides if a path is invisible machinery.
- Every consumer of exclusion logic imports from this module.
- Existing behavior is preserved for every consumer after migration.

**Non-Goals:**
- Change the contents of the exclusion list (we merge the existing lists, not expand them).
- Refactor how `.gitignore` / `.mimoignore` patterns are parsed and applied (those remain workspace-specific and live in `files/service.ts`).
- Introduce globs or regexes into the central policy (the existing consumers match by exact name, prefix, or path component; this is sufficient).

## Decisions

### 1. Put the module in `domain/files/`, not `domain/vcs/`

**Rationale:** The module is about "which paths the system should treat as invisible" — it is consumed by the file finder, impact analysis, VCS scan, sync service, and UI. `domain/files/` is the shared dependency of all these callers. Placing it in `domain/vcs/` would wrongly imply it is VCS-only.

### 2. One array `EXCLUDED_PATHS` + one function `isExcluded(path)`

**Rationale:** We considered splitting into `getPrefixes()`, `getExactPaths()`, `getGlobs()` for different consumers, but the lists overlap heavily and every consumer can work with a single predicate. Fewer exports, fewer tests, less surface area.

The function handles three cases:
1. Exact match (`path === ".git"`)
2. Prefix match (`path.startsWith(".git/")`)
3. Component match at any depth (`"src/.git/config"` contains `.git`)

### 3. Pure function, no class, no injection

**Rationale:** The exclusion rules are global constants (VCS internals are universal). No I/O, no config, no state. A pure function is simplest and testable with zero setup.

### 4. Preserve existing string[] export for consumers that need it

`syncIgnoresToFossil` writes patterns to a file. Instead of calling `isExcluded` per item, it needs the list. We export `EXCLUDED_PATHS: readonly string[]` so it can map to glob patterns (`.git`, `.git/**`, etc.).

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Miss a consumer during migration | Audited every file that imports `VCS_INTERNALS` or defines `IMPACT_*`. We will delete the old constants to prevent silent re-use. |
| `isExcluded` is slightly slower than a `Set` lookup for `scanDirectory` | Negligible — the array has <20 elements and the function runs in microsecond range. If it becomes a hotspot, we can add an internal `Set` without changing the API. |
| Fossil `ignore-glob` needs trailing-`/**` patterns | `syncIgnoresToFossil` maps `EXCLUDED_PATHS` to glob syntax locally; the policy module stays agnostic of glob formatting. |

## Migration Plan

1. Create `domain/files/path-policy.ts` with tests.
2. Update `domain/files/service.ts` to use `isExcluded` in the file finder filter.
3. Update `domain/files/impact-file-policy.ts` to delegate to `isExcluded`.
4. Update `domain/vcs/index.ts` to import `EXCLUDED_PATHS` and `isExcluded`; remove `VCS_INTERNALS`, `VCS_METADATA`, `DEFAULT_FOSSIL_IGNORE_PATTERNS`.
5. Update `domain/files/changed-files.ts`, `domain/sync/service.ts`, `web/sessions/pages/sessions.tsx` to import from `path-policy`.
6. Run full test suite.
7. Delete dead code in `vcs/index.ts` and `impact-file-policy.ts`.

## Open Questions

- None at this time.
