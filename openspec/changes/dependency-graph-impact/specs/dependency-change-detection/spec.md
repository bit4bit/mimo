## ADDED Requirements

### Requirement: Detect new directory dependencies
The system SHALL detect when changed files create new import relationships between directories.

#### Scenario: New dependency between components and utils
- **WHEN** a file in `src/components` imports from `src/utils` for the first time
- **THEN** the system reports `+ src/components → src/utils` with the file name

#### Scenario: Multiple files create same dependency
- **WHEN** multiple files in source directory import from same target directory
- **THEN** the system groups all files under single dependency line

### Requirement: Detect removed directory dependencies
The system SHALL detect when changed files remove existing import relationships between directories.

#### Scenario: Import removed from file
- **WHEN** a file that previously imported from another directory no longer has that import
- **THEN** the system reports `- src/services → src/api` with the file name

### Requirement: Support TypeScript and JavaScript imports
The system SHALL parse ES6 and CommonJS import patterns from `.ts`, `.tsx`, `.js`, and `.jsx` files.

#### Scenario: ES6 default import detected
- **WHEN** file contains `import foo from './utils/foo'`
- **THEN** the system extracts `utils` as target directory

#### Scenario: ES6 named import detected
- **WHEN** file contains `import { foo } from '../utils/helpers'`
- **THEN** the system extracts `utils` as target directory

#### Scenario: CommonJS require detected
- **WHEN** file contains `const foo = require('./utils/foo')`
- **THEN** the system extracts `utils` as target directory

### Requirement: Support Python imports
The system SHALL parse `import` and `from...import` statements from `.py` files.

#### Scenario: Python import detected
- **WHEN** file contains `import utils.helpers`
- **THEN** the system extracts `utils` as target directory

#### Scenario: Python from import detected
- **WHEN** file contains `from utils import helpers`
- **THEN** the system extracts `utils` as target directory

### Requirement: Support Elixir imports
The system SHALL parse `alias`, `import`, `use`, and `require` statements from `.ex` and `.exs` files.

#### Scenario: Elixir alias detected
- **WHEN** file contains `alias MyApp.Utils.Helpers`
- **THEN** the system extracts `Utils` as target directory

#### Scenario: Elixir import detected
- **WHEN** file contains `import MyApp.Utils`
- **THEN** the system extracts `Utils` as target directory

### Requirement: Display in tree format
The system SHALL render dependency changes in hierarchical text format.

#### Scenario: New dependency displayed
- **WHEN** a new dependency is detected
- **THEN** the system displays `+ source → target` followed by indented file list

#### Scenario: Removed dependency displayed
- **WHEN** a removed dependency is detected
- **THEN** the system displays `- source → target` followed by indented file list

### Requirement: Filter external dependencies
The system SHALL ignore imports from external packages (node_modules, system packages).

#### Scenario: External package import ignored
- **WHEN** file contains `import React from 'react'` (not a relative path)
- **THEN** the system does not include this in dependency analysis
