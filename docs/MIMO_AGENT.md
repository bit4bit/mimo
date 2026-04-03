# mimo-agent

A standalone TypeScript/Bun agent that connects to mimo-platform and provides file watching and ACP (Agent Communication Protocol) proxy functionality.

## Overview

mimo-agent is a separate binary that runs alongside the platform. It:
- Connects to the platform via WebSocket
- Watches files in the session worktree for changes
- Proxies communication with ACP agents
- Reports file changes back to the platform

## Installation

### Prerequisites

- Bun 1.0+
- Platform running at known URL

### Building from Source

```bash
cd packages/mimo-agent
bun install
bun run build
```

This creates `dist/mimo-agent` which is a self-contained executable (~50MB).

## Usage

### Command Line Arguments

```bash
./mimo-agent --token <JWT_TOKEN> --platform <PLATFORM_URL> [--workdir <PATH>]
```

**Required Arguments**:

- `--token <JWT_TOKEN>`: JWT token for authentication with the platform
- `--platform <URL>`: WebSocket URL of the platform (e.g., `ws://localhost:3000/ws/agent`)

**Optional Arguments**:

- `--workdir <PATH>`: Working directory to watch for changes (defaults to current directory)

### Example

```bash
./dist/mimo-agent \
  --token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --platform ws://localhost:3000/ws/agent \
  --workdir /home/user/projects/my-app
```

## Communication Protocol

### WebSocket Messages

**From Agent to Platform**:

```json
{
  "type": "agent_ready",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

```json
{
  "type": "file_changed",
  "files": [
    { "path": "src/app.js", "isNew": false },
    { "path": "src/new.ts", "isNew": true }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

```json
{
  "type": "acp_response",
  "content": "Response content from ACP agent",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**From Platform to Agent**:

```json
{ "type": "ping" }
```

```json
{
  "type": "acp_request",
  "command": "echo",
  "args": ["Hello"]
}
```

```json
{ "type": "cancel_request" }
```

```json
{ "type": "terminate" }
```

## File Watching

The agent uses Node.js `fs.watch` to monitor the working directory recursively.

**Behavior**:
- Changes are debounced (500ms) to batch rapid modifications
- Ignores hidden files (starting with `.`)
- Ignores common directories: `node_modules`, `__pycache__`
- Ignores temporary files: `*.tmp`, files ending with `~`

**Change Detection**:
- New files: `isNew: true`
- Modified files: `isNew: false`
- Deleted files: Currently reported as modified (implementation detail)

## ACP Proxy

When the platform sends an `acp_request`:

1. Agent spawns the ACP process using `child_process.spawn`
2. Proxies stdout/stderr to the platform via WebSocket
3. Handles process exit and cleanup
4. Supports request cancellation via SIGTERM

**Example ACP Request**:

```json
{
  "type": "acp_request",
  "command": "my-acp-agent",
  "args": ["--mode", "interactive"]
}
```

## Reconnection

The agent implements automatic reconnection:

- **Initial delay**: 1 second
- **Exponential backoff**: 1s, 2s, 4s, 8s, 16s
- **Max attempts**: 5
- **Buffered changes**: Sent after successful reconnection

## Environment Variables

- `DEBUG=1`: Enable debug logging
- `NODE_ENV=production`: Production mode

## Exit Codes

- `0`: Clean shutdown (SIGTERM/SIGINT)
- `1`: Error (connection failed, invalid arguments, etc.)

## Troubleshooting

### Connection Failed

```
[Error: Connection timeout]
```

**Solution**: Check platform URL and ensure platform is running.

### Authentication Failed

```
WebSocket closed with code 1008: Invalid token
```

**Solution**: Verify JWT token is valid and not expired (24h lifetime).

### File Watching Not Working

**Check**:
1. `--workdir` points to correct directory
2. Directory exists and is readable
3. Not a network-mounted filesystem (may have issues)

### High CPU Usage

**Cause**: File watcher triggering frequently on large directories.

**Solution**: Increase debounce delay in source code or exclude large directories.

## Development

```bash
# Run in development mode
bun run dev

# Run tests
bun test

# Build binary
bun run build
```

## Architecture

```
┌─────────────────────────────────────────┐
│           mimo-agent                    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │        WebSocket Client         │   │
│  │    (ws library)                 │   │
│  │                                 │   │
│  │  • Auto-reconnect               │   │
│  │  • Message handling             │   │
│  │  • JWT authentication           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │        File Watcher             │   │
│  │    (fs.watch)                   │   │
│  │                                 │   │
│  │  • Recursive watching           │   │
│  │  • Debounced changes            │   │
│  │  • Ignore patterns              │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │        ACP Process Manager      │   │
│  │    (child_process.spawn)        │   │
│  │                                 │   │
│  │  • Process spawning             │   │
│  │  • Stdio proxy                  │   │
│  │  • Signal handling              │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```
