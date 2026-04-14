## MODIFIED Requirements

### Requirement: Agent spawns ACP process per session
The system SHALL spawn one ACP process per session with MCP server configurations passed to newSession.

#### Scenario: ACP process spawns with MCP servers
- **WHEN** agent successfully clones fossil checkout
- **AND** SessionInfo has mcpServers: [{name: "filesystem", command: "npx", args: [...]}]
- **THEN** agent spawns ACP process in checkout directory
- **AND** agent calls AcpClient.initialize(cwd, stdin, stdout, existingSessionId)
- **AND** AcpClient calls connection.newSession({cwd, mcpServers})
- **AND** mcpServers parameter contains full server configurations

#### Scenario: ACP process spawns without MCP servers
- **WHEN** agent spawns ACP process
- **AND** SessionInfo has mcpServers: []
- **THEN** AcpClient calls connection.newSession({cwd, mcpServers: []})

#### Scenario: Store MCP servers in SessionInfo
- **WHEN** agent receives session_ready with mcpServers
- **THEN** agent stores mcpServers array in SessionInfo
- **AND** mcpServers are available when spawning ACP process

#### Scenario: ACP initialization with MCP servers
- **WHEN** AcpClient.initialize() is called
- **AND** SessionInfo contains mcpServers
- **THEN** AcpClient extracts state from session response as before
- **AND** AcpClient stores mcpServers for newSession call
- **AND** AcpClient calls connection.newSession({cwd, mcpServers})

#### Scenario: ACP newSession with populated mcpServers
- **WHEN** AcpClient calls connection.newSession({cwd, mcpServers})
- **AND** mcpServers is [{name: "filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."]}]
- **THEN** ACP process receives mcpServers configuration
- **AND** ACP process spawns MCP server subprocesses as configured

#### Scenario: Backward compatibility with old agents
- **WHEN** old agent receives session_ready with mcpServers field
- **AND** old agent does not recognize mcpServers field
- **THEN** old agent ignores unknown field (graceful degradation)
- **AND** old agent spawns ACP with empty mcpServers: []
- **AND** session works without MCP server capabilities
