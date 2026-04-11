## ADDED Requirements

### Requirement: Composite ignore file generation
The system SHALL generate a composite ignore file by combining `.fossil-settings/ignore-glob`, `.gitignore`, and `.mimoignore` in that order of precedence.

#### Scenario: Generate composite from all three sources
- **WHEN** SCC is run on a directory
- **THEN** the system SHALL check for `.fossil-settings/ignore-glob`, `.gitignore`, and `.mimoignore`
- **AND** combine their contents into `.mimo/cache/scc-ignore-combined.txt`
- **AND** include comment headers indicating the source of each section

#### Scenario: Handle missing source files
- **WHEN** one or more source ignore files do not exist
- **THEN** the system SHALL log a warning message
- **AND** continue execution with the available source files
- **AND** not fail the SCC execution

### Requirement: Composite file format
The system SHALL generate a composite ignore file with proper formatting and source annotations.

#### Scenario: Composite file includes source sections
- **WHEN** the composite ignore file is generated
- **THEN** each section SHALL be prefixed with a comment indicating its source
- **AND** the format SHALL be: `# --- From: {source-path} ---`
- **AND** the sections SHALL be ordered: fossil-settings → gitignore → mimoignore

#### Scenario: Duplicate patterns are preserved
- **WHEN** the same pattern exists in multiple source files
- **THEN** all occurrences SHALL be preserved in the composite file
- **AND** SCC SHALL handle duplicates internally

### Requirement: MIMO-specific ignore patterns
The system SHALL support a `.mimoignore` file for MIMO-specific patterns.

#### Scenario: Create .mimoignore file
- **WHEN** a user wants to exclude files from SCC statistics
- **THEN** they can create a `.mimoignore` file in the project root
- **AND** use standard gitignore glob pattern syntax
- **AND** patterns in `.mimoignore` SHALL have the highest precedence

#### Scenario: Common MIMO patterns
- **WHEN** `.mimoignore` is created with standard content
- **THEN** it SHOULD include: `.mimo/cache/`, `.mimo/logs/`, `*.mimo.tmp`
- **AND** these patterns SHALL be included in the composite ignore file
