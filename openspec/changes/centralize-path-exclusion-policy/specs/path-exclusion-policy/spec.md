## ADDED Requirements

### Requirement: Centralized path exclusion policy
The system SHALL provide a single module that defines which paths are treated as invisible system machinery.

#### Scenario: Exact path excluded
- **GIVEN** a path exactly matching an excluded entry (e.g., `.git`)
- **WHEN** `isExcluded(path)` is called
- **THEN** it returns `true`

#### Scenario: Nested path excluded
- **GIVEN** a nested path containing an excluded component (e.g., `src/.git/config`)
- **WHEN** `isExcluded(path)` is called
- **THEN** it returns `true`

#### Scenario: Prefix path excluded
- **GIVEN** a path that starts with an excluded directory (e.g., `.git/hooks`)
- **WHEN** `isExcluded(path)` is called
- **THEN** it returns `true`

#### Scenario: Normal project file not excluded
- **GIVEN** a normal project file (e.g., `src/index.ts`)
- **WHEN** `isExcluded(path)` is called
- **THEN** it returns `false`

#### Scenario: User-defined ignored file not automatically excluded
- **GIVEN** a path matching a pattern in `.gitignore` but not in the built-in exclusion list
- **WHEN** `isExcluded(path)` is called
- **THEN** it returns `false`
- **AND** the path is still excluded by the file finder through `.gitignore` processing

### Requirement: Export canonical exclusion list
The policy module SHALL export the canonical list of excluded path components so consumers that need raw patterns can access them.

#### Scenario: Derive fossil ignore-glob patterns
- **GIVEN** the system needs to sync default ignore patterns to Fossil
- **WHEN** it reads `EXCLUDED_PATHS`
- **THEN** it receives the array of excluded path components
- **AND** it can map them into Fossil `ignore-glob` syntax (e.g., `.git` and `.git/**`)
