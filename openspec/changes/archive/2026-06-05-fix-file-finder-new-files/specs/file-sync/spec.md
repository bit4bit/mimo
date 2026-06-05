## MODIFIED Requirements

### Requirement: Agent reports file changes to platform

The system SHALL receive file change notifications from mimo-agent. For newly created files, the `isNew` field SHALL be `true`.

#### Scenario: Single file change

- **WHEN** agent modifies file "src/app.js"
- **THEN** mimo-agent sends WebSocket message: {type: "file_changed", files: ["src/app.js"]}
- **AND** platform marks file with [M] indicator

#### Scenario: Multiple file changes

- **WHEN** agent modifies multiple files
- **THEN** mimo-agent sends single message with all changed files
- **AND** platform updates all file indicators

#### Scenario: New file created

- **WHEN** agent creates new file "src/new.ts" that does not exist on disk before the write
- **THEN** mimo-agent sends message: {type: "file_changed", files: ["src/new.ts"], isNew: true}
- **AND** platform marks file with [?] indicator

#### Scenario: Existing file overwritten

- **WHEN** agent writes to an existing file "src/existing.ts"
- **THEN** mimo-agent sends message: {type: "file_changed", files: ["src/existing.ts"], isNew: false}
- **AND** platform marks file with [M] indicator