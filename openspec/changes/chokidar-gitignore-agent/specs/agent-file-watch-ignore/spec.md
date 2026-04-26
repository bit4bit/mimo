## ADDED Requirements

### Requirement: Watcher ignores VCS internals
The file watcher SHALL never emit change events for paths whose first segment is a VCS internal directory (`.git`, `.fossil`, `.fslckout`, `.fossil-settings`).

#### Scenario: Change inside .git directory is suppressed
- **WHEN** a file inside `.git/` is modified in the checkout directory
- **THEN** no file change event is emitted by the watcher

#### Scenario: Change inside .fossil-settings directory is suppressed
- **WHEN** a file inside `.fossil-settings/` is modified
- **THEN** no file change event is emitted by the watcher

### Requirement: Watcher ignores built-in artifact patterns
The file watcher SHALL never emit change events for paths matching built-in default patterns: `node_modules`, `__pycache__`, `*.tmp`, `*~`.

#### Scenario: Change inside node_modules is suppressed
- **WHEN** a file inside `node_modules/` is modified
- **THEN** no file change event is emitted by the watcher

#### Scenario: Temp file change is suppressed
- **WHEN** a file ending in `.tmp` is modified
- **THEN** no file change event is emitted by the watcher

### Requirement: Watcher respects .gitignore patterns
The file watcher SHALL read `.gitignore` from the checkout root at session start and suppress events for all paths matching its patterns.

#### Scenario: File matching .gitignore pattern is ignored
- **WHEN** `.gitignore` contains `dist/` and a file inside `dist/` is modified
- **THEN** no file change event is emitted by the watcher

#### Scenario: File not matching .gitignore pattern is not ignored
- **WHEN** `.gitignore` contains `dist/` and a file outside `dist/` is modified
- **THEN** a file change event IS emitted by the watcher

#### Scenario: Missing .gitignore does not cause an error
- **WHEN** no `.gitignore` exists at the checkout root
- **THEN** the watcher starts successfully with built-in defaults only

### Requirement: Watcher respects .mimoignore patterns
The file watcher SHALL read `.mimoignore` from the checkout root at session start and suppress events for all paths matching its patterns, with the same semantics as `.gitignore`.

#### Scenario: File matching .mimoignore pattern is ignored
- **WHEN** `.mimoignore` contains `*.generated.ts` and a matching file is modified
- **THEN** no file change event is emitted by the watcher

#### Scenario: Missing .mimoignore does not cause an error
- **WHEN** no `.mimoignore` exists at the checkout root
- **THEN** the watcher starts successfully using only .gitignore patterns and built-in defaults

### Requirement: Ignored predicate is injected via FileSystem.watch options
The `FileSystem.watch()` interface SHALL accept an optional `ignored` predicate function. When provided, chokidar uses it to suppress events at the source.

#### Scenario: Predicate suppresses events before callback
- **WHEN** `watch()` is called with an `ignored` function that returns true for a path
- **THEN** the listener callback is never invoked for that path
