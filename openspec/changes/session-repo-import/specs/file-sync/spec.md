## MODIFIED Requirements

### Requirement: Platform synchronizes changes to checkout directory

The system SHALL copy changed files from agent workdir to session's `checkout/` directory.

#### Scenario: Sync modified file
- **WHEN** platform receives file change notification
- **THEN** system copies file from agent workdir to session `checkout/` directory
- **AND** system preserves file permissions
- **AND** system updates file status indicators

#### Scenario: Sync new file
- **WHEN** platform receives new file notification
- **THEN** system copies file to `checkout/` and creates parent directories if needed
- **AND** system preserves file permissions

#### Scenario: Batch sync on reconnect
- **WHEN** user reconnects after offline period
- **THEN** system receives all buffered file changes
- **AND** system syncs all files to `checkout/` directory

### Requirement: Agent reports file changes to platform

The system SHALL receive file change notifications from mimo-agent via WebSocket.

#### Scenario: Single file change
- **WHEN** agent modifies file "src/app.js" in local workdir
- **THEN** mimo-agent sends WebSocket message: `{type: "file_changed", sessionId: "...", files: [{path: "src/app.js", status: "modified"}]}`
- **AND** platform applies change to `checkout/`
- **AND** platform marks file with [M] indicator

#### Scenario: Multiple file changes
- **WHEN** agent modifies multiple files
- **THEN** mimo-agent sends single message with all changed files
- **AND** platform updates all file indicators in `checkout/`

#### Scenario: New file created
- **WHEN** agent creates new file "src/new.ts" in local workdir
- **THEN** mimo-agent sends message: `{type: "file_changed", sessionId: "...", files: [{path: "src/new.ts", status: "new"}]}`
- **AND** platform copies file to `checkout/`
- **AND** platform marks file with [?] indicator