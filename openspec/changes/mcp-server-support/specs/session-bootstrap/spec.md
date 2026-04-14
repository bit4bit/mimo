## MODIFIED Requirements

### Requirement: Platform sends complete session information to agent
The system SHALL send complete session bootstrap information including MCP server configurations when agent connects.

#### Scenario: Session bootstrap includes MCP server configs
- **WHEN** agent connects via WebSocket with valid token
- **AND** agent has session with mcpServerIds: ["filesystem", "github"]
- **THEN** system resolves MCP server IDs to full configurations
- **AND** system sends session_ready message with mcpServers array containing full configs
- **AND** each mcpServer includes {name, command, args}

#### Scenario: Session bootstrap with no MCP servers
- **WHEN** agent connects and session has mcpServerIds: []
- **THEN** system sends session_ready with mcpServers: []

#### Scenario: Resolve MCP server configurations
- **WHEN** platform resolves mcpServerIds ["filesystem", "github"]
- **AND** filesystem config is {name: "filesystem", command: "npx", args: [...]}
- **AND** github config is {name: "github", command: "npx", args: [...]}
- **THEN** resolved mcpServers array contains both configurations

#### Scenario: MCP server not found during bootstrap
- **WHEN** platform attempts to resolve mcpServerIds containing "deleted-server"
- **AND** "deleted-server" configuration no longer exists
- **THEN** system sends session_error message with reason "MCP server 'deleted-server' not found"
- **AND** system skips sending session_ready for that session
- **AND** agent logs error and continues with other sessions

#### Scenario: Agent receives MCP server configs in session_ready
- **WHEN** agent receives session_ready message
- **AND** message includes mcpServers: [{name, command, args}, ...]
- **THEN** agent stores mcpServers in SessionInfo
- **AND** agent includes mcpServers in ACP newSession call
