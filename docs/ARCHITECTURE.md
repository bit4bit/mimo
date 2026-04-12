# Architecture

This document describes the architecture of the MIMO platform.

## System Overview

MIMO is a web-based development environment built with:
- **Runtime**: Bun (JavaScript/TypeScript runtime)
- **Web Framework**: Hono (Lightweight web framework)
- **Frontend**: Server-side rendered JSX with vanilla JavaScript
- **Storage**: Filesystem-based (YAML, JSONL)
- **VCS**: Fossil as intermediary layer
- **Authentication**: JWT tokens

## Components

### 1. Web Interface (Client-Side)

**Location**: `packages/mimo-platform/src/components/`

- **Layout.tsx**: Base HTML layout with status line
- **SessionDetailPage.tsx**: Three-buffer layout (Files, Chat, Changes)
- **ProjectsListPage.tsx**: Project listing
- **ConfigEditorPage.tsx**: Configuration UI

**Key Features**:
- Server-side rendered JSX (no client-side framework)
- Vanilla JavaScript for interactivity
- WebSocket for real-time chat
- Status line shows available keybindings

### 2. Platform Server (Server-Side)

**Location**: `packages/mimo-platform/src/`

#### Core Modules

**Authentication** (`auth/`)
- JWT-based authentication
- Password hashing with bcrypt
- Session management via cookies

**Projects** (`projects/`)
- Project CRUD operations
- Repository import (Git → Fossil)
- Filesystem structure: `~/.mimo/projects/{id}/`

**Sessions** (`sessions/`)
- Session lifecycle management
- Fossil worktree setup
- Chat history storage (JSONL format)
- WebSocket chat endpoint

**Agents** (`agents/`)
- Agent process spawning
- JWT token generation for agents
- WebSocket agent endpoint (`/ws/agent`)
- Process monitoring and cleanup

**File Sync** (`sync/`)
- MD5 checksum-based change detection
- Conflict detection with baseline tracking
- Bidirectional sync (session ↔ original repo)
- REST API for sync operations

**Commits** (`commits/`)
- Fossil commit operations
- Push to remote repositories
- Conflict resolution
- Status and history endpoints

**VCS** (`vcs/`)
- Fossil CLI abstraction
- Server management
- Port auto-assignment (8000-9000)

**Configuration** (`config/`)
- YAML configuration loading
- Validation with helpful errors
- Default values with merge

### 3. Agent Binary

**Location**: `packages/mimo-agent/`

A standalone TypeScript/Bun binary that:
- Connects to platform via WebSocket
- Watches files for changes
- Proxies ACP (Agent Communication Protocol) requests
- Reports file changes to platform

**Communication Flow**:
```
Browser ←→ Platform WebSocket ←→ Agent WebSocket
                      ↓
              ACP Process (spawned)
```

## Data Flow

### File Synchronization

```
1. Agent modifies file
2. Agent sends "file_changed" message to Platform
3. Platform receives message via WebSocket
4. Platform copies file to original repo worktree
5. Platform updates change indicators in UI
6. User commits → Fossil commit → Push to remote
```

### Chat Flow

```
1. User sends message
2. Platform saves to JSONL
3. Platform broadcasts to all connected browsers
4. Platform forwards to Agent
5. Agent sends to ACP process
6. ACP response → Agent → Platform
7. Platform saves and broadcasts to browsers
```

## Filesystem Structure

```
~/.mimo/
├── config.yaml              # User preferences
│
├── users/
│   └── {username}/
│       └── credentials.yaml
│
├── projects/
│   └── {uuid}/
│       ├── project.yaml     # Project metadata
│       ├── repo.fossil     # Fossil repository
│       ├── original/        # Original repo worktree
│       │   ├── .fslckout
│       │   └── [source files]
│       └── sessions/
│           └── {uuid}/
│               ├── session.yaml
│               ├── chat.jsonl    # Chat history
│               └── worktree/     # Session worktree
│                   ├── .fslckout
│                   └── [source files]
│
└── agents/
    └── {uuid}/
        └── agent.yaml       # Agent metadata
```

## WebSocket Endpoints

### Chat WebSocket (`/ws/chat/:sessionId`)

**Messages from Client**:
- `send_message`: Send chat message
- `request_replay`: Request chat history replay
- `refresh_impact`: Trigger manual SCC impact refresh
- `request_impact_stale`: Request current impact stale status

**Messages to Client**:
- `history`: Full chat history
- `message`: New message (user or assistant)
- `impact_stale`: Impact cache became stale after file changes
- `impact_calculating`: Impact refresh is running
- `impact_updated`: Fresh impact metrics are available
- `impact_error`: Impact refresh failed

### Agent WebSocket (`/ws/agent`)

**Query Parameter**: `token` (JWT)

**Messages from Agent**:
- `agent_ready`: Agent connected successfully
- `acp_response`: Response from ACP process
- `file_changed`: File modification notification
- `ping`: Keepalive

**Messages to Agent**:
- `pong`: Keepalive response
- `acp_request`: Forward request to ACP
- `cancel_request`: Cancel current ACP request
- `terminate`: Kill agent

## Authentication

### JWT Tokens

**User Tokens**:
- Stored in HTTP-only cookies
- Expire after 24 hours
- Signed with `JWT_SECRET` env var

**Agent Tokens**:
- Generated per-agent
- Include agentId, sessionId, projectId, owner
- Passed via WebSocket query parameter
- Validated on connection

## Security Considerations

1. **Path Traversal**: All file operations use path.join and validation
2. **Token Validation**: JWT verified on every protected route
3. **Process Isolation**: Agents run as separate processes
4. **Secret Management**: JWT_SECRET should be set in production
5. **Input Validation**: All user inputs validated before use

## Performance

- **File Sync**: MD5 checksums cached, batched changes
- **Chat**: JSONL append-only, streaming reads
- **Sessions**: Lazy loading, cleanup on disconnect
- **Agents**: Process pooling, heartbeat monitoring

## Scalability Limits

Current design assumes:
- Single instance deployment
- Filesystem-based storage
- WebSocket connections maintained in memory

For horizontal scaling, would need:
- External session store (Redis)
- Shared storage (NFS/S3)
- Load balancer with sticky sessions
