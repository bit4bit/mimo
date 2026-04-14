## Context

MCP (Model Context Protocol) servers extend AI agent capabilities by providing standardized access to external tools, resources, and prompts. The ACP protocol already supports passing `mcpServers` to `newSession()`, but mimo currently always passes an empty array. Users need a way to configure MCP servers centrally and attach them to sessions.

Current architecture: Sessions are assigned to agents, which spawn ACP processes. The agent receives session configuration via WebSocket `session_ready` messages, then initializes ACP with `cwd` and empty `mcpServers: []`.

## Goals / Non-Goals

**Goals:**
- Allow users to create and manage MCP server configurations at user level
- Enable session creation with selected MCP servers attached
- Pass full MCP server configurations from platform to agent via existing WebSocket messages
- Agent populates ACP `newSession()` with actual MCP server configs instead of empty array
- Provide UI for MCP server management and session attachment

**Non-Goals:**
- Dynamic attach/detach of MCP servers to running sessions (requires ACP restart)
- Environment variables or secrets management in MCP server configs (v1 - command+args only)
- Project-level or shared MCP servers (v1 - user-level only)
- MCP server status monitoring or health checks
- Validation that MCP server commands exist before spawning

## Decisions

### 1. Store MCP servers at user level, not project level
**Rationale**: MCP servers are personal configurations (like agent definitions). A user's "filesystem" or "github" server config is reusable across all their projects.

**Alternative considered**: Project-level MCP servers. Rejected because it creates duplication when same server needed across multiple projects.

### 2. Sessions store `mcpServerIds`, agent receives full configs
**Rationale**: Platform owns the MCP server configs. Sessions only reference them by ID to avoid data duplication and ensure updates propagate. Agent needs full configs to spawn ACP, so platform resolves IDs to configs before sending `session_ready`.

**Flow**:
```
Session (mcpServerIds: ["filesystem", "github"])
  └─► Platform resolves IDs → full configs
    └─► session_ready message includes full configs
      └─► Agent passes configs to ACP newSession()
```

### 3. Simple command+args configuration (no env vars for v1)
**Rationale**: Keeps v1 minimal. Most MCP servers work with command+args. Environment variables can be added later without breaking changes.

### 4. Auto-slugify MCP server names for IDs
**Rationale**: User-friendly display names like "GitHub API" become URL-safe IDs like "github-api". Prevents collisions and special character issues.

**Algorithm**: Lowercase, replace spaces/special chars with hyphens, collapse multiple hyphens.

### 5. No validation of MCP server commands
**Rationale**: Let ACP handle command execution failures. Platform doesn't need to verify `npx` exists or server package is installed.

### 6. MCP server name field is the ACP identifier
**Rationale**: ACP uses `name` to identify which server provides which tools. Must be unique within a session's MCP server list.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Editing MCP server doesn't update running sessions | Document that sessions must be recreated to pick up config changes. Acceptable for v1. |
| MCP server command fails (not installed, etc) | ACP will report error. Agent propagates error to platform via existing error handling. |
| Duplicate MCP server names in same session | Validate uniqueness in session creation. Reject if same `name` field appears multiple times. |
| Old agents don't know about `mcpServers` field | Field is additive - old agents ignore it and spawn ACP with empty `mcpServers: []`. Behavior degrades gracefully. |
| User configures malicious command | Out of scope for v1 - user responsibility. Future: add approval flow for new MCP servers. |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCP SERVER DATA FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Platform (mimo-platform)                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  MCP Server Repository                                              │   │
│  │  ~/.mimo/mcp-servers/{id}/config.yaml                               │   │
│  │  { id, name, description, command, args, createdAt, updatedAt }     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ Create session                          │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Session Repository                                                  │   │
│  │  ~/.mimo/projects/{pid}/sessions/{sid}/session.yaml                   │   │
│  │  { ..., mcpServerIds: ["filesystem", "github"], ... }               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ Notify agent                            │
│                                    ▼                                        │
│  WebSocket: session_ready {                                                 │
│    sessionId, fossilUrl, ...,                                               │
│    mcpServers: [                                                            │
│      { name: "filesystem", command: "npx", args: [...] },                   │
│      { name: "github", command: "npx", args: [...] }                       │
│    ]                                                                        │
│  }                                                                          │
│                                    │                                        │
│  Agent (mimo-agent)                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SessionManager                                                      │   │
│  │  SessionInfo.mcpServers = message.mcpServers                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  AcpClient.initialize(cwd, stdin, stdout, existingSessionId)       │   │
│  │    connection.newSession({ cwd, mcpServers: sessionInfo.mcpServers })│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ACP Process (opencode/claude)                                              │
│  Spawns MCP server processes as configured                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Migration Plan

**New installations**: MCP server directory created on first use.

**Existing installations**:
- MCP servers directory is created lazily when user creates first MCP server
- Existing sessions have no `mcpServerIds` field - treated as empty array
- Backward compatible - old sessions work without MCP servers

**Rollback**: Delete MCP server configurations. Sessions with those servers will fail to start until recreated without them.

## Open Questions

1. Should we allow multiple MCP servers with the same command but different args? (Yes - different names make them distinct)
2. Should MCP server deletion be blocked if sessions reference it? (No - let deletion proceed, sessions fail on restart with clear error)
