## MODIFIED Requirements

### Requirement: open_file Tool
The MCP endpoint SHALL provide an `open_file` tool that opens a file in the session's EditBuffer. The tool MAY accept an optional 1-based `line` argument that scrolls the target line into the centered view after the file is loaded.

#### Scenario: Tool schema advertises optional line
- **WHEN** an ACP client calls `tools/list`
- **THEN** the `open_file` tool's `inputSchema` SHALL declare `path` (string, required) and `line` (integer, minimum 1, optional)

#### Scenario: Open a valid file without line
- **WHEN** an ACP calls `open_file` with a path that exists within the session workspace and no `line` argument
- **THEN** the platform SHALL broadcast `{ type: "open_file_in_editbuffer", sessionId, path }` to all WebSocket clients for that session
- **AND** the broadcast payload SHALL NOT include a `line` field
- **AND** the tool SHALL return `{ success: true, path }`

#### Scenario: Open a valid file at a specific line
- **WHEN** an ACP calls `open_file` with a valid path and `line: N` where N is a positive integer
- **THEN** the platform SHALL broadcast `{ type: "open_file_in_editbuffer", sessionId, path, line: N }` to all WebSocket clients for that session
- **AND** the tool SHALL return `{ success: true, path }`

#### Scenario: Invalid line value is dropped, call still succeeds
- **WHEN** an ACP calls `open_file` with a valid path and a `line` value that is not a positive integer (e.g. `0`, `-3`, `1.5`, `"abc"`, `null`)
- **THEN** the platform SHALL broadcast the open without a `line` field
- **AND** the tool SHALL return `{ success: true, path }`

#### Scenario: Line larger than file is tolerated
- **WHEN** an ACP calls `open_file` with a valid path and a `line` value greater than the file's line count
- **THEN** the server SHALL still broadcast `{ type: "open_file_in_editbuffer", sessionId, path, line }` (the server SHALL NOT reject based on line count)
- **AND** the tool SHALL return `{ success: true, path }`

#### Scenario: Path outside workspace
- **WHEN** an ACP calls `open_file` with a path that traverses outside the session workspace (e.g., `../../etc/passwd`)
- **THEN** the tool SHALL return an error result: `{ success: false, error: "Access denied: path outside workspace" }`
- **AND** no broadcast SHALL be sent

#### Scenario: File does not exist
- **WHEN** an ACP calls `open_file` with a path that does not exist in the session workspace
- **THEN** the tool SHALL return an error result: `{ success: false, error: "File not found" }`
- **AND** no broadcast SHALL be sent

---

### Requirement: EditBuffer Handles open_file_in_editbuffer
The EditBuffer client SHALL load and display the file referenced by an `open_file_in_editbuffer` WebSocket event. When the event includes a `line` field, the EditBuffer SHALL center that line in the visible content area after loading.

#### Scenario: Open without line preserves default scroll
- **WHEN** the EditBuffer receives `{ type: "open_file_in_editbuffer", path, sessionId }` with no `line` field
- **THEN** the file SHALL be loaded into the EditBuffer using the existing file-content fetch
- **AND** the EditBuffer tab SHALL be focused
- **AND** no programmatic scroll-to-line SHALL occur

#### Scenario: Open with line scrolls target line into centered view
- **WHEN** the EditBuffer receives `{ type: "open_file_in_editbuffer", path, sessionId, line: N }` where N is a positive integer
- **AND** the loaded file contains a line at position N
- **THEN** the row identified by `tr[data-line-number="N"]` SHALL be scrolled into view with the line centered

#### Scenario: Line beyond file length is ignored gracefully
- **WHEN** the EditBuffer receives `{ type: "open_file_in_editbuffer", path, sessionId, line: N }` where N exceeds the file's line count
- **THEN** the file SHALL still be loaded and the EditBuffer tab focused
- **AND** no error SHALL be raised; the scroll-to-line attempt SHALL silently no-op
