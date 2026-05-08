## Why

The system excludes VCS-internal paths (`.git`, `.fossil`, `.fossil-settings`, etc.) from various operations, but the list of exclusions is duplicated across multiple files. `vcs/index.ts` defines `VCS_INTERNALS` and `VCS_METADATA`; `files/impact-file-policy.ts` defines `IMPACT_EXCLUDED_PATHS`; and `files/service.ts` defines `DEFAULT_IGNORE_PATTERNS`. These lists overlap but are not identical, and no single source of truth exists. As a result, the file finder does not exclude `.git/` or `.fossil-settings/` unless a `.gitignore` or `.mimoignore` happens to contain them. Centralizing the exclusion logic into one module ensures every subsystem (file finder, impact analysis, VCS scan, diff cleaning) treats the same paths as invisible machinery.

## What Changes

- Create a single `domain/files/path-policy.ts` module that owns the canonical list of built-in excluded paths and exposes one pure function `isExcluded(path)` and one array `EXCLUDED_PATHS`
- Delete `VCS_INTERNALS` and `VCS_METADATA` from `domain/vcs/index.ts` and import from `path-policy`
- Delete `IMPACT_EXCLUDED_PATHS`, `IMPACT_EXCLUDED_PATH_PREFIXES`, and `buildImpactIgnorePatterns` from `domain/files/impact-file-policy.ts`; delegate to `isExcluded`
- Delete `DEFAULT_IGNORE_PATTERNS` from `domain/files/service.ts`; inject excluded paths via the shared policy module
- Update `sync/service.ts`, `changed-files.ts`, `sessions.tsx`, `vcs.server.ts`, and any other consumers to import from `path-policy`
- Update `syncIgnoresToFossil` to derive its default ignore-glob patterns from `EXCLUDED_PATHS`
- New or updated integration tests that verify `isExcluded` returns `true` for every built-in exclusion and `false` for normal project files

## Capabilities

### New Capabilities

- `path-exclusion-policy`: A centralized policy for built-in VCS and Mimo-internal path exclusions, consumed by file finder, impact analysis, VCS sync, and diff rendering to ensure consistent behavior.

### Modified Capabilities

- `file-finder`: The file finder SHALL automatically exclude built-in system paths (`.git`, `.fossil`, `.fossil-settings`, `.mimo`, etc.) in addition to user-defined `.gitignore` and `.mimoignore` patterns.
- `vcs-integration`: The fossil `ignore-glob` sync SHALL derive default patterns from the centralized exclusion list instead of its own `DEFAULT_FOSSIL_IGNORE_PATTERNS`.
- `impact-tracking`: Impact analysis SHALL use the centralized exclusion function instead of its own `IMPACT_EXCLUDED_PATHS`.

## Impact

- `packages/mimo-platform/src/domain/files/path-policy.ts` (new)
- `packages/mimo-platform/src/domain/files/service.ts`
- `packages/mimo-platform/src/domain/files/impact-file-policy.ts`
- `packages/mimo-platform/src/domain/files/changed-files.ts`
- `packages/mimo-platform/src/domain/vcs/index.ts`
- `packages/mimo-platform/src/domain/vcs/server.ts` (if it references excluded paths)
- `packages/mimo-platform/src/domain/sync/service.ts`
- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx`
- `packages/mimo-platform/test/files-service.test.ts`
- `packages/mimo-platform/test/impact-tracking.test.ts` (or related impact tests)
- `packages/mimo-platform/test/vcs.test.ts`
