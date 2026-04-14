## ADDED Requirements

### Requirement: User can create MCP server configuration
The system SHALL allow users to create MCP server configurations that can be attached to sessions.

#### Scenario: Create MCP server with command and args
- **WHEN** authenticated user submits MCP server form with name "Filesystem", command "npx", args ["-y", "@modelcontextprotocol/server-filesystem", "."]
- **THEN** system generates id "filesystem" from name (slugified)
- **AND** system creates directory ~/.mimo/mcp-servers/filesystem/
- **AND** system writes config.yaml with {id, name, description, command, args, createdAt, updatedAt}
- **AND** system displays MCP servers list with new server

#### Scenario: Slugify MCP server name for ID
- **WHEN** user creates MCP server with name "GitHub API"
- **THEN** system generates id "github-api" (lowercase, spaces to hyphens)
- **AND** when user creates server with name "PostgreSQL DB"
- **THEN** system generates id "postgresql-db"

#### Scenario: Duplicate MCP server name
- **WHEN** user submits name "filesystem" and id "filesystem" already exists
- **THEN** system returns validation error "MCP server with this name already exists"
- **AND** system does not create duplicate

#### Scenario: Empty MCP server name
- **WHEN** user submits MCP server form with empty name
- **THEN** system returns validation error "Name is required"

#### Scenario: Empty MCP server command
- **WHEN** user submits MCP server form with empty command
- **THEN** system returns validation error "Command is required"

### Requirement: User can list MCP servers
The system SHALL display all MCP servers configured by the user.

#### Scenario: Display MCP servers list
- **WHEN** authenticated user navigates to /mcp-servers
- **THEN** system reads ~/.mimo/mcp-servers/ directory
- **AND** system displays list with name, description, command for each server
- **AND** system provides Create, Edit, and Delete actions

#### Scenario: Empty MCP servers list
- **WHEN** user navigates to /mcp-servers with no servers configured
- **THEN** system displays empty state with "No MCP servers configured" message
- **AND** system provides Create button

### Requirement: User can edit MCP server configuration
The system SHALL allow users to modify existing MCP server configurations.

#### Scenario: Edit MCP server command and args
- **WHEN** authenticated user edits MCP server "filesystem" changing args to ["/home/user/project"]
- **THEN** system updates config.yaml with new args
- **AND** system updates updatedAt timestamp
- **AND** system displays success message

#### Scenario: Edit MCP server name
- **WHEN** user edits MCP server changing name from "Filesystem" to "Project Files"
- **THEN** system keeps original id "filesystem" (ID is immutable)
- **AND** system updates name field in config.yaml

#### Scenario: Edit non-existent MCP server
- **WHEN** user attempts to edit MCP server with id "nonexistent"
- **THEN** system returns 404 error
- **AND** system displays "MCP server not found"

### Requirement: User can delete MCP server configuration
The system SHALL allow users to remove MCP server configurations.

#### Scenario: Delete MCP server
- **WHEN** authenticated user deletes MCP server "filesystem"
- **THEN** system removes ~/.mimo/mcp-servers/filesystem/ directory
- **AND** system displays MCP servers list without deleted server

#### Scenario: Delete MCP server referenced by sessions
- **WHEN** user deletes MCP server "filesystem"
- **AND** existing sessions have mcpServerIds including "filesystem"
- **THEN** system deletes the MCP server configuration
- **AND** system does NOT modify existing sessions
- **AND** those sessions will fail on restart with "MCP server not found" error

#### Scenario: Delete non-existent MCP server
- **WHEN** user attempts to delete MCP server with id "nonexistent"
- **THEN** system returns 404 error
- **AND** system displays "MCP server not found"

### Requirement: MCP server configuration schema
The system SHALL validate MCP server configurations against required schema.

#### Scenario: Valid MCP server configuration
- **WHEN** system validates MCP server with {name, command, args}
- **THEN** validation passes
- **AND** system accepts configuration

#### Scenario: MCP server with optional description
- **WHEN** user creates MCP server with description "Access to project files"
- **THEN** system stores description in config.yaml
- **AND** description is displayed in MCP servers list

#### Scenario: MCP server with empty args
- **WHEN** user creates MCP server with empty args array []
- **THEN** system accepts configuration
- **AND** args is stored as empty array
