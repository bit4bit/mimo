# mimo-agent

A TypeScript/Bun agent that connects to mimo-platform, manages multiple sessions, clones from Fossil proxy servers, and spawns ACP processes per session.

## Installation

```bash
cd packages/mimo-agent
bun install
```

## Building

Build the standalone binary:

```bash
bun run build
```

This creates `dist/mimo-agent` which is a self-contained executable.

## Usage

```bash
./dist/mimo-agent --token <JWT_TOKEN> --platform <WEBSOCKET_URL> [--workdir <PATH>] [--provider <PROVIDER>]
```

### Arguments

- `--token`: JWT token for authentication (required)
- `--platform`: WebSocket URL of the mimo-platform (required). Must use the address the agent can reach — when agent and platform are on different hosts, use the platform's actual hostname/IP, not `localhost`.
- `--workdir`: Base working directory for session checkouts (optional, defaults to current directory)
- `--provider`: ACP provider to use — `opencode` (default), `claude`, or `codex`

### Example — same host

```bash
./dist/mimo-agent \
  --token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --platform ws://localhost:3000/ws/agent \
  --workdir /home/user/work
```

### Example — agent on a remote host

```bash
# On the platform host, start with PLATFORM_URL set to its reachable address:
PLATFORM_URL=http://192.168.1.10:3000 bun run src/index.tsx

# On the agent host:
./dist/mimo-agent \
  --token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --platform ws://192.168.1.10:3000/ws/agent \
  --workdir /home/agent/work
```

> The platform sends its `PLATFORM_URL` to the agent in every `session_ready` message. The agent uses it to build the Fossil server URL. If `PLATFORM_URL` is not set on the platform, it defaults to `http://localhost:<PORT>`, which will not be reachable from a remote agent.

## Architecture

### Multi-Session Model

mimo-agent supports **multiple concurrent sessions**, each with its own:
- Fossil checkout directory (cloned from platform's fossil proxy)
- ACP process (spawned in the checkout directory)
- File watcher (for change notifications)

```
┌─────────────────────────────────────────────────────────────────┐
│                        mimo-platform                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 WebSocket Server (/ws/agent)               │   │
│  └──────────────────────────┬──────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              │ WebSocket + JWT Auth
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                             │                                   │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │                    mimo-agent                            │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │            sessions: Map<sessionId, Session>     │   │   │
│  │  │                                                   │   │   │
│  │  │  Session {                                        │   │   │
│  │  │    sessionId: string                             │   │   │
│  │  │    checkoutPath: string   <- relative to workdir│   │   │
│  │  │    fossilUrl: string                             │   │   │
│  │  │    acpProcess: ChildProcess | null               │   │   │
│  │  │    fileWatcher: FSWatcher | null                 │   │   │
│  │  │  }                                                │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Session Bootstrap Flow

```
Agent connects → Platform sends session_ready → Agent clones fossil → Agent spawns ACP
     │                    │                           │                    │
     │                    │                           │                    │
     └────────────────────┘                           └────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────────────────────────┐
        │          session_ready message                     │
        │  {                                                │
        │    "type": "session_ready",                       │
        │    "platformUrl": "http://<PLATFORM_URL>:3000",        │
        │    "sessions": [                                  │
        │      {                                            │
        │        "sessionId": "uuid-1",                     │
        │        "port": 8080                               │
        │      }                                            │
        │    ]                                              │
        │  }                                                │
        └───────────────────────────────────────────────────┘
```

### Checkout Path

The agent uses a simple convention: `{workdir}/{sessionId}`

- If agent is started with `--workdir /home/user/work`
- And receives session with `sessionId: "abc-123"`
- Checkout will be at `/home/user/work/abc-123`

No path coordination needed between platform and agent.

## Protocol

### Handshake

1. **Agent sends `agent_ready`:**
   ```json
   {
     "type": "agent_ready",
     "workdir": "/home/user/work",
     "timestamp": "2024-01-15T10:30:00Z"
   }
   ```

2. **Platform responds with `session_ready`:**
   ```json
   {
     "type": "session_ready",
     "platformUrl": "http://<PLATFORM_URL>:3000",
     "sessions": [
       {
         "sessionId": "session-uuid",
         "port": 8080,
         "checkoutPath": "projects/abc/sessions/1/checkout"
       }
     ]
   }
   ```

3. **Agent bootstraps each session:**
   - Clones from fossil: `fossil clone http://localhost:8080 checkoutPath`
   - Starts file watcher in checkout directory
   - Sends `agent_sessions_ready`:

   ```json
   {
     "type": "agent_sessions_ready",
     "sessionIds": ["session-uuid-1", "session-uuid-2"],
     "timestamp": "2024-01-15T10:30:05Z"
   }
   ```

### File Changes

```json
{
  "type": "file_changed",
  "sessionId": "session-uuid",
  "files": [
    { "path": "src/app.js", "isNew": false, "deleted": false }
  ],
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### ACP Communication

```json
// Platform -> Agent
{
  "type": "acp_request",
  "sessionId": "session-uuid",
  "command": "opencode",
  "args": ["--prompt", "Add dark mode"]
}

// Agent -> Platform
{
  "type": "acp_response",
  "sessionId": "session-uuid",
  "content": "I'll help you add dark mode...",
  "timestamp": "2024-01-15T10:36:00Z"
}
```

### Error Handling

```json
{
  "type": "session_error",
  "sessionId": "session-uuid",
  "error": "Failed to clone fossil repository: connection refused",
  "timestamp": "2024-01-15T10:30:02Z"
}
```

## Features

### Multi-Session Support
- Maintains map of sessions with individual checkouts
- Routes messages to correct session by sessionId
- Spawns separate ACP process per session
- Independent file watcher per session

### Fossil Clone
- Clones from platform's fossil proxy server on session_ready
- Opens existing checkout if already present (reconnection scenario)
- Relative checkout paths from workdir

### File Watching
- Watches checkout directory recursively for each session
- Debounces changes (500ms) to batch rapid modifications
- Reports changes to platform with sessionId
- Ignores hidden files and common directories (node_modules, __pycache__)

### ACP Integration
- Uses `@agentclientprotocol/sdk` for ACP communication
- Spawns ACP process in session checkout directory
- Proxies stdin/stdout between platform and ACP
- Supports request cancellation (SIGTERM)

### Reconnection
- Automatically reconnects on WebSocket disconnect
- Exponential backoff (max 5 attempts)
- Opens existing checkouts on reconnect (no re-clone)

### Local Development Mirror

The agent can sync file changes to a local development directory in real-time, allowing you to test changes immediately in your IDE without committing.

**How it works:**
1. Set `defaultLocalDevMirrorPath` on a Project (optional - serves as default for all sessions)
2. Set `localDevMirrorPath` on a Session (inherited from project, can be customized per session)
3. When files change in the checkout, the agent syncs them to the mirror path

**Sync behavior:**
- **Agent wins**: When files change, the agent immediately overwrites the mirror copy
- **Skips VCS directories**: `.git/` and `.fossil/` are never synced (preserves your own VCS state)
- **Graceful errors**: Missing paths or permission errors log a warning but don't block operation

**Configuration:**
```json
// session_ready message includes the mirror path:
{
  "type": "session_ready",
  "sessions": [{
    "sessionId": "uuid",
    "localDevMirrorPath": "/home/user/myproject-dev"
  }]
}
```

**Example scenario:**
```bash
# User wants agent changes synced to their local working directory
# 1. Create project with default mirror path: /home/user/dev/myproject
# 2. Create session - mirror path pre-filled from project default
# 3. Agent makes changes → files appear instantly in /home/user/dev/myproject
# 4. User can run tests, use IDE, etc. without commit cycle
```

### Codex Provider Setup

To use the Codex ACP provider, install the `codex-acp` binary and configure credentials.

**Installation options:**
- **Via npm (recommended):** `npm install -g @zed-industries/codex-acp`
- **Via release:** Download from [GitHub releases](https://github.com/zed-industries/codex-acp/releases)

**Credentials:**
Codex requires one of the following authentication methods:
- `CODEX_API_KEY` environment variable
- `OPENAI_API_KEY` environment variable
- ChatGPT login (requires paid subscription, not recommended for remote/headless setups)

**Usage:**
```bash
# With API key
export CODEX_API_KEY=sk-...
./dist/mimo-agent --token <JWT> --platform <WS_URL> --provider codex

# Or inline
CODEX_API_KEY=sk-... ./dist/mimo-agent --token <JWT> --platform <WS_URL> --provider codex
```

**Note:** Ensure `codex-acp` is available on `PATH`. The agent will fail at spawn time if the binary is not found.

## Troubleshooting

### Clone Failures

1. **"Failed to clone fossil repository"**
   - Check that fossil server is running on the specified port
   - Verify platformUrl is correct and accessible
   - Check network connectivity

2. **"Session not found"**
   - Session may have been deleted while agent was disconnected
   - Agent should handle session_error and continue with other sessions

3. **"Checkout already exists"**
   - Agent will attempt to open existing checkout on reconnect
   - If corrupted, delete the checkout directory manually

### Platform Issues

1. **"Workdir not received"**
   - Ensure `workdir` field is sent in `agent_ready`
   - Platform uses workdir to compute relative checkout paths

2. **"Unknown session"**
   - Session may not be assigned to this agent
   - Check that session's `assignedAgentId` matches agent's ID