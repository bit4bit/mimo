## ADDED Requirements

### Requirement: Complete Sessions Routes HTTP Proxy

The system SHALL refactor all remaining Sessions routes to use HTTP `fetch()` calls to the internal API, removing all 57+ direct service/repository calls.

#### Scenario: Create session via HTTP proxy

- **WHEN** a POST request is made to `/sessions`
- **THEN** the route SHALL make an HTTP POST request to `/api/internal/sessions`
- **AND** NOT call `sessionRepository.create()` directly
- **AND** NOT call `mcpServerService.findAll()` directly

#### Scenario: Delete session via HTTP proxy

- **WHEN** a DELETE operation is performed on a session
- **THEN** the route SHALL make an HTTP DELETE request to `/api/internal/sessions/:id`
- **AND** NOT call `sessionRepository.delete()` directly
- **AND** NOT call `sessionRepository.findById()` directly (for verification)

#### Scenario: Update session via HTTP proxy

- **WHEN** session updates are performed
- **THEN** the route SHALL make an HTTP PUT request to `/api/internal/sessions/:id`
- **AND** NOT call `sessionRepository.update()` directly

#### Scenario: List sessions via HTTP proxy

- **WHEN** sessions need to be listed
- **THEN** the route SHALL make an HTTP GET request to `/api/internal/sessions`
- **AND** NOT call `sessionRepository.listAll()` directly

#### Scenario: Get assigned agent via HTTP proxy

- **WHEN** session details need agent information
- **THEN** the route SHALL make an HTTP GET request to `/api/internal/agents/:id`
- **AND** NOT call `agentRepository.findById()` directly

#### Scenario: Get MCP servers via HTTP proxy

- **WHEN** session creation needs MCP server list
- **THEN** the route SHALL make an HTTP GET request to `/api/internal/mcp-servers`
- **AND** NOT call `mcpServerService.findAll()` directly

### Requirement: Sessions Chat Operations via HTTP Proxy

The system SHALL complete the HTTP proxy implementation for chat operations.

#### Scenario: Load chat history

- **WHEN** chat history is loaded for a session
- **THEN** the route SHALL make an HTTP GET request to `/api/internal/sessions/:id/chat`
- **AND** NOT call `chatService.loadHistory()` directly

#### Scenario: Save chat message

- **WHEN** a chat message needs to be saved
- **THEN** the route SHALL make an HTTP POST request to `/api/internal/sessions/:id/chat`
- **AND** NOT call `chatService.saveMessage()` directly

### Requirement: Infrastructure and Runtime Calls Exclusion

The system SHALL NOT proxy infrastructure and runtime state calls to the internal API.

#### Scenario: Fossil server URL

- **WHEN** the fossil URL is needed
- **THEN** the route MAY call `sharedFossilServer.getUrl()` directly
- **AND** this is infrastructure, not business logic

#### Scenario: Runtime state

- **WHEN** runtime model/mode state is needed
- **THEN** the route MAY call `sessionStateService.getModelState()` directly
- **AND** this is runtime state, not persisted data

### Requirement: Zero Direct Repository Calls

The system SHALL have zero direct service/repository calls for persisted data in Sessions routes after completion.

#### Scenario: Verification

- **WHEN** the refactor is complete
- **THEN** `grep -c "sessionRepository\."` SHALL return 0
- **AND** `grep -c "chatService\."` SHALL return 0 (for persisted operations)
- **AND** `grep -c "mcpServerService\."` SHALL return 0 (for persisted operations)
- **AND** `grep -c "agentRepository\."` SHALL return 0 (for persisted operations)
