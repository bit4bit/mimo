# mimo-agent

A TypeScript/Bun agent that connects to mimo-platform and provides file watching and ACP proxy functionality.

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
./dist/mimo-agent --token <JWT_TOKEN> --platform <WEBSOCKET_URL> [--workdir <PATH>]
```

### Arguments

- `--token`: JWT token for authentication (required)
- `--platform`: WebSocket URL of the mimo-platform (required)
- `--workdir`: Working directory to watch for changes (optional, defaults to current directory)

### Example

```bash
./dist/mimo-agent \
  --token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --platform ws://localhost:3000/ws/agent \
  --workdir /home/user/projects/my-app
```

## Features

### File Watching
- Watches the working directory recursively for file changes
- Debounces changes (500ms) to batch rapid modifications
- Reports changes to the platform via WebSocket
- Ignores hidden files and common directories (node_modules, __pycache__)

### ACP Proxy
- Receives ACP requests from the platform
- Spawns ACP agent process and proxies stdio
- Supports request cancellation (SIGTERM)

### Reconnection
- Automatically reconnects on WebSocket disconnect
- Exponential backoff (max 5 attempts)
- Buffers changes during disconnect

## Protocol

### WebSocket Messages

**From Agent to Platform:**

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
  "content": "Response content...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**From Platform to Agent:**

```json
{
  "type": "ping"
}
```

```json
{
  "type": "acp_request",
  "command": "echo",
  "args": ["Hello, World!"]
}
```

```json
{
  "type": "cancel_request"
}
```

## Development

```bash
# Run in development mode
bun run dev

# Run tests
bun test
```

## Architecture

```
┌─────────────────────────────────────┐
│           mimo-platform             │
│  ┌─────────────────────────────┐  │
│  │   WebSocket Server            │  │
│  │   (/ws/agent)                 │  │
│  └────────────┬────────────────┘  │
└───────────────┼─────────────────────┘
                │
                │ WebSocket + JWT Auth
                │
┌───────────────┼─────────────────────┐
│               │                     │
│  ┌────────────▼────────────────┐   │
│  │       mimo-agent            │   │
│  │  ┌──────────────────────┐   │   │
│  │  │  File Watcher        │   │   │
│  │  │  (fs.watch)          │   │   │
│  │  └──────────────────────┘   │   │
│  │  ┌──────────────────────┐   │   │
│  │  │  ACP Process         │   │   │
│  │  │  (Bun.spawn)         │   │   │
│  │  └──────────────────────┘   │   │
│  └──────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```
