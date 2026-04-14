## 1. MCP Server Repository (mcp-servers capability)

- [x] 1.1 Create McpServerRepository class in `packages/mimo-platform/src/mcp-servers/repository.ts`
- [x] 1.2 Implement create() method with slugify logic for ID generation
- [x] 1.3 Implement findById(), findAll(), update(), delete() methods
- [x] 1.4 Add slugify utility function (lowercase, spaces to hyphens, collapse multiples)
- [x] 1.5 Create McpServer TypeScript interface with {id, name, description, command, args, createdAt, updatedAt}
- [x] 1.6 Write tests for McpServerRepository

## 2. MCP Server Service (mcp-servers capability)

- [x] 2.1 Create McpServerService class in `packages/mimo-platform/src/mcp-servers/service.ts`
- [x] 2.2 Implement validation: name required, command required, unique name check
- [x] 2.3 Implement resolveMcpServers(ids: string[]) to fetch full configs by IDs
- [x] 2.4 Write tests for McpServerService

## 3. MCP Server HTTP Routes (mcp-servers capability)

- [x] 3.1 Create routes file `packages/mimo-platform/src/mcp-servers/routes.ts`
- [x] 3.2 Implement GET /mcp-servers endpoint (list all)
- [x] 3.3 Implement POST /mcp-servers endpoint (create)
- [x] 3.4 Implement GET /mcp-servers/:id endpoint (get one)
- [x] 3.5 Implement PATCH /mcp-servers/:id endpoint (update)
- [x] 3.6 Implement DELETE /mcp-servers/:id endpoint (delete)
- [x] 3.7 Register routes in main app
- [x] 3.8 Write integration tests for MCP server API

## 4. MCP Server UI Components (mcp-servers capability)

- [x] 4.1 Create McpServerListPage component with table layout
- [x] 4.2 Add Create button linking to form page
- [x] 4.3 Add Edit/Delete actions for each server
- [x] 4.4 Create McpServerForm component (create/edit)
- [x] 4.5 Add form fields: name, description, command, args (textarea, one per line)
- [x] 4.6 Add validation error display
- [x] 4.7 Create empty state for list page

## 5. Session Management Updates (session-management capability)

- [x] 5.1 Add mcpServerIds: string[] field to Session interface in repository
- [x] 5.2 Add mcpServerIds to CreateSessionInput interface
- [x] 5.3 Update session.yaml serialization/deserialization
- [x] 5.4 Update session creation validation: validate MCP server IDs exist
- [x] 5.5 Add validation: check for duplicate MCP server names within session
- [x] 5.6 Update session routes to accept mcpServerIds from form
- [x] 5.7 Write tests for session creation with MCP servers

## 6. Session Bootstrap Updates (session-bootstrap capability)

- [x] 6.1 Update session bootstrap logic to resolve mcpServerIds to full configs
- [x] 6.2 Include mcpServers array in session_ready WebSocket message
- [x] 6.3 Handle case where MCP server not found: send session_error
- [ ] 6.4 Update SessionInfo type to include mcpServers
- [ ] 6.5 Write tests for session bootstrap with MCP servers

## 7. Session Create Page Updates (session-management capability)

- [x] 7.1 Fetch MCP servers list in SessionCreatePage
- [x] 7.2 Add multi-select dropdown for MCP servers
- [x] 7.3 Display MCP server name and description in dropdown
- [x] 7.4 Pass selected MCP server IDs to session creation API

## 8. Agent Types Updates (agent-lifecycle capability)

- [x] 8.1 Add McpServerConfig interface to `packages/mimo-agent/src/types.ts`
- [x] 8.2 Add mcpServers: McpServerConfig[] field to SessionInfo interface
- [ ] 8.3 Write tests for new types

## 9. Agent Session Management Updates (agent-lifecycle capability)

- [x] 9.1 Update SessionManager.createSession to accept mcpServers parameter
- [x] 9.2 Store mcpServers in SessionInfo
- [ ] 9.3 Write tests for SessionManager with MCP servers

## 10. Agent ACP Client Updates (agent-lifecycle capability)

- [x] 10.1 Update AcpClient.initialize() to accept mcpServers parameter
- [x] 10.2 Pass mcpServers to connection.newSession({cwd, mcpServers}) call
- [x] 10.3 Update spawnAcpProcess to pass mcpServers from SessionInfo
- [x] 10.4 Update handleSessionReady to extract mcpServers from message and store
- [ ] 10.5 Write tests for AcpClient with MCP servers

## 11. Agent Integration Updates (agent-lifecycle capability)

- [x] 11.1 Update session_ready message handler to process mcpServers field
- [x] 11.2 Ensure backward compatibility: old agents ignore unknown mcpServers field
- [x] 11.3 Update respawnAcpProcess to include MCP servers
- [ ] 11.4 Write integration tests for agent with MCP servers

## 12. Configuration and Paths

- [x] 12.1 Add getMcpServersPath() to config/paths.ts
- [x] 12.2 Create ~/.mimo/mcp-servers/ directory lazily

## 13. Documentation and Cleanup

- [ ] 13.1 Update README.md with MCP server documentation
- [ ] 13.2 Update AGENTS.md with MCP server architecture
- [x] 13.3 Run all tests and ensure they pass
- [x] 13.4 Verify backward compatibility with existing sessions
