## MODIFIED Requirements

### Requirement: User can create a session
The system SHALL allow users to create sessions within a project with optional MCP server attachments.

#### Scenario: Create session with MCP servers
- **WHEN** authenticated user submits session creation form with name "feature-work" and selected MCP servers ["filesystem", "github"]
- **THEN** system validates all MCP server IDs exist
- **AND** system creates session directory ~/.mimo/projects/{project}/sessions/{session}/
- **AND** system writes session.yaml with mcpServerIds: ["filesystem", "github"]
- **AND** system displays session view

#### Scenario: Create session without MCP servers
- **WHEN** authenticated user submits session creation form with name "simple-session" and no MCP servers selected
- **THEN** system creates session with mcpServerIds: []
- **AND** system displays session view

#### Scenario: Create session with invalid MCP server ID
- **WHEN** user submits session creation with mcpServerIds containing "nonexistent"
- **THEN** system returns validation error "MCP server 'nonexistent' not found"
- **AND** system does not create session

#### Scenario: Duplicate MCP server names in session
- **WHEN** user attempts to attach MCP servers where two have same name field "my-server"
- **THEN** system returns validation error "Duplicate MCP server name 'my-server'"
- **AND** system does not create session

### Requirement: Session stores MCP server references
The system SHALL store MCP server references in session configuration.

#### Scenario: Session yaml includes mcpServerIds
- **WHEN** session is created with MCP servers ["filesystem", "github"]
- **THEN** session.yaml contains mcpServerIds: ["filesystem", "github"]
- **AND** system validates MCP server IDs on read (backward compatibility for old sessions without field)
