## ADDED Requirements

### Requirement: List MCP servers endpoint
The system SHALL provide an internal API endpoint that returns all MCP servers.

#### Scenario: User requests MCP servers list
- **WHEN** an authenticated GET request is made to `/api/internal/mcp-servers`
- **THEN** the system SHALL return all configured MCP servers
- **AND** include id, name, description, transport, command/args or url/headers

### Requirement: Get MCP server endpoint
The system SHALL provide an internal API endpoint that returns a specific MCP server.

#### Scenario: User requests specific MCP server
- **WHEN** an authenticated GET request is made to `/api/internal/mcp-servers/:id`
- **THEN** the system SHALL return the MCP server with matching ID

#### Scenario: User requests non-existent MCP server
- **WHEN** an authenticated GET request is made for a non-existent MCP server
- **THEN** the system SHALL return a 404 error

### Requirement: Create MCP server endpoint
The system SHALL provide an internal API endpoint that creates an MCP server.

#### Scenario: User creates stdio MCP server
- **WHEN** an authenticated POST request is made with transport="stdio", name, command, and args
- **THEN** the system SHALL create the MCP server
- **AND** return the created server

#### Scenario: User creates HTTP MCP server
- **WHEN** an authenticated POST request is made with transport="http", name, url, and headers
- **THEN** the system SHALL create the MCP server
- **AND** return the created server

### Requirement: Update MCP server endpoint
The system SHALL provide an internal API endpoint that updates an MCP server.

#### Scenario: User updates MCP server
- **WHEN** an authenticated PUT request is made to `/api/internal/mcp-servers/:id`
- **THEN** the system SHALL update the MCP server
- **AND** return the updated server

### Requirement: Delete MCP server endpoint
The system SHALL provide an internal API endpoint that deletes an MCP server.

#### Scenario: User deletes MCP server
- **WHEN** an authenticated DELETE request is made to `/api/internal/mcp-servers/:id`
- **THEN** the system SHALL delete the MCP server
- **AND** return a success confirmation
