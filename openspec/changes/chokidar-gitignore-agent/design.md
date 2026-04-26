## Context

mimo-agent watches a session's checkout directory with chokidar to detect file changes and forward them to the platform. Currently `session.ts` hard-filters events in the callback after chokidar has already emitted them. This is wasteful — chokidar has a native `ignored` option that suppresses events before they are emitted.

The `FileSystem` interface in `os/types.ts` abstracts OS-level operations. The `watch()` method currently accepts `{ recursive?: boolean }` only. No gitignore awareness exists anywhere in the agent.

## Goals / Non-Goals

**Goals:**
- Chokidar never emits events for gitignored, mimoignored, VCS-internal, or built-in artifact paths.
- `FileSystem.watch()` interface gains an `ignored` predicate — generic, not gitignore-specific.
- `session.ts` builds the predicate using the `ignore` npm package and injects it.
- The existing callback filter block is removed entirely.

**Non-Goals:**
- mimo-platform watcher — out of scope.
- Nested `.gitignore` files (subdirectory-level) — only the checkout root is read.
- Hot-reloading ignore rules if `.gitignore`/`.mimoignore` change while a session is active.

## Decisions

### D1 — `ignored` as a function, not `string[]`

The `FileSystem.watch()` option is `ignored?: (path: string) => boolean`, not `ignored?: string[]`.

**Why**: The OS adapter (`node-adapter.ts`) should be a dumb shim. Knowing how to parse gitignore patterns is business logic. Passing a function keeps the interface general and the adapter free of the `ignore` package. Any ignore logic — not just gitignore — can be injected by the caller.

**Alternative considered**: Pass `string[]` and let the adapter build the predicate using `ignore`. Rejected: leaks gitignore semantics into the OS abstraction layer.

### D2 — `ignore` npm package in `session.ts`

`session.ts` imports `ignore` directly to build the predicate.

**Why**: `ignore` is the reference implementation of the gitignore spec — handles anchoring, `**`, negation, character classes, and directory-only patterns correctly. The platform's custom minimatch does not cover the full spec.

**Alternative considered**: Inline a custom matcher (reuse platform logic). Rejected: duplicates code across packages and misses edge cases.

### D3 — VCS_INTERNALS as a fast-path, not via `ignore`

`.fossil`, `.fslckout`, `.fossil-settings`, `.git` are checked directly against the first path segment before calling `ig.ignores()`.

**Why**: These are unconditional — they must always be ignored regardless of what the ignore files say. A fast Set lookup avoids parsing overhead and ensures they cannot be accidentally un-ignored via a negation pattern in `.gitignore`.

### D4 — Built-in defaults loaded into `ignore` instance

`node_modules`, `__pycache__`, `*.tmp`, `*~` are added to the `ignore` instance as default patterns, alongside patterns from `.gitignore`/`.mimoignore`.

**Why**: Consolidates all pattern-based filtering in one place. These defaults protect sessions without any ignore files.

### D5 — Missing ignore files are silently skipped

If `.gitignore` or `.mimoignore` do not exist at the checkout root, the watcher starts with built-in defaults only. No error or warning.

**Why**: Valid repositories often have no `.gitignore`. Failing or warning would be disruptive.

## Risks / Trade-offs

- **Directory-only patterns (`node_modules/`) do not prune at the directory level** → `ig.ignores('node_modules')` returns false per the gitignore spec (pattern only matches directories, `ignore` package cannot know the path is a directory without stats). Chokidar will traverse into the directory but suppress all file events inside. Performance impact is minor in practice because most `.gitignore` files use `node_modules` without the trailing slash. Mitigation: acceptable for now; can be improved later by passing `stats` to the predicate.

- **Ignore rules are snapshot at session start** → if `.gitignore` changes while a session is running, the watcher does not pick up the new patterns. Mitigation: sessions are typically short-lived; users can restart.

## Open Questions

None — all decisions are settled.
