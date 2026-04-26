## Why

The chokidar directory watcher in mimo-agent fires change events for files users have explicitly excluded (.gitignore, .mimoignore) and for VCS internals, build artifacts, and temp files. This generates noise that the session processes unnecessarily — these events should never reach the callback at all.

## What Changes

- Add `"ignore"` npm package (^7.0.5) to mimo-agent dependencies for full gitignore-spec pattern matching.
- Extend `FileSystem.watch()` options with an optional `ignored?: (path: string) => boolean` predicate — the OS abstraction stays generic; no gitignore knowledge leaks into the adapter.
- `session.ts` builds the predicate at watcher startup: VCS_INTERNALS fast-path + default patterns (node_modules, __pycache__, *.tmp, *~) + patterns from `.gitignore` and `.mimoignore` at the checkout root.
- Remove the existing hardcoded filter block from the callback — suppression now happens inside chokidar before events are emitted.

## Capabilities

### New Capabilities

- `agent-file-watch-ignore`: Chokidar watcher in mimo-agent respects .gitignore and .mimoignore patterns, plus built-in VCS and artifact defaults, via an `ignored` predicate injected through `FileSystem.watch()` options.

### Modified Capabilities

## Impact

- `packages/mimo-agent/package.json` — new dependency: `ignore ^7.0.5`
- `packages/mimo-agent/src/os/types.ts` — `FileSystem.watch()` options extended
- `packages/mimo-agent/src/os/node-adapter.ts` — forwards `options.ignored` to chokidar
- `packages/mimo-agent/src/os/mock-adapter.ts` — signature widened (no-op behaviour unchanged)
- `packages/mimo-agent/src/session.ts` — builds `ignored` predicate, removes old filter block
- No API changes visible outside mimo-agent
