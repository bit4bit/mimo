# MIMO Platform

[MOVED TO](https://codeberg.org/bit4bit/mimo)

My opinionated agent development environment. A personal tool for daily development activities and a training dojo for tuning LLM-assisted workflows.

A web-based interface for AI-assisted development with session-based worktrees, structured change management, and multi-provider agent support.

## Features

- **Two-Frame Interface**: Chat (left), Notes/Impact/MCP (right) buffers
- **Quick Session Finder/Creator**: Fast search and creation of sessions from the dashboard
- **Session-Based Development**: Isolated Fossil worktrees for each development session with file synchronization
- **Session Parking**: Automatic idle timeout that terminates ACP processes to free resources, with transparent wake-up
- **Integrated Chat**: Real-time streaming chat with AI agents via WebSocket
- **Chat System Errors**: System-level error messages in chat for better debugging
- **Summarize History**: Chat history summarization for context management
- **Open File from Chat**: Click file references in chat to open them in EditBuffer
- **Debounced Activity**: Smart activity tracking to reduce unnecessary syncs
- **VCS Integration**: Fossil as intermediary for both Git and Fossil repositories
- **Agent Providers**: Support for Opencode and Claude ACP providers
- **MCP Server Support**: Configure and attach MCP servers to sessions
- **Impact Tracking**: File changes, lines of code, complexity metrics (SCC), and code duplication (jscpd)
- **Expert Mode**: Precise control over code modifications with structured replacements

## Installation

Download pre-built binaries from the [releases page](https://github.com/bit4bit/mimo/releases).

### Prerequisites

- [Fossil](https://fossil-scm.org) 2.27+
- Git (for Git repository support)
- [ripgrep (rg)](https://github.com/BurntSushi/ripgrep) (required for content search in EditBuffer)

### Quick Start

```bash
# Download for your platform (Linux x64 or macOS ARM64)
curl -L -o mimo-platform https://github.com/bit4bit/mimo/releases/latest/download/mimo-platform-linux-x64
chmod +x mimo-platform

# Run
./mimo-platform
```

Platform runs at `http://localhost:3000`

### Run an Agent

```bash
# Download agent binary
curl -L -o mimo-agent https://github.com/bit4bit/mimo/releases/latest/download/mimo-agent-linux-x64
chmod +x mimo-agent

# Run with your agent token
./mimo-agent --token <AGENT_JWT> --platform ws://localhost:3000/ws/agent --provider opencode
```

## Run with Docker Compose

Docker Compose is the official deployment method.

This repo includes `Dockerfile.mimo` and `docker-compose.yml` that run:

- `mimo-platform` with Bun runtime
- `agent-opencode` with Bun runtime (OpenCode provider)
- `agent-claude` with Bun runtime (Claude Code provider)

The agents use this shared workdir path in the container:

- `/home/app/.mimo-agent`

Mapped host folders:

- `~/.mimo-agent-container` → `/home/app/.mimo-agent` (shared workdir)
- `~/.config/opencode` → `/home/app/.config/opencode` (OpenCode config)
- `~/.claude` → `/home/app/.claude` (Claude Code data)
- `~/.claude.json` → `/home/app/.claude.json` (Claude Code config)

Before first run, create a local env file and set required values:

```bash
cp .env.example .env
```

Then edit `.env`:

- `JWT_SECRET`
- `OPENCODE_AGENT_JWT`
- `CLAUDE_AGENT_JWT`

For Docker Compose networking (agent -> platform/fossil):

- `MIMO_HOST=localhost` (general host value for local platform URLs)
- `MIMO_LISTEN_HOST=0.0.0.0` (bind interface inside container)
- `MIMO_SHARED_FOSSIL_SERVER_HOST=platform` (hostname embedded in fossil URLs for agent containers)

Use the provided `Makefile` to start Docker Compose with your current UID/GID automatically:

```bash
make daemon
```

One-line setup/run instructions:

- `cp .env.example .env`
- `# update environment values in .env (JWT_SECRET, OPENCODE_AGENT_JWT, CLAUDE_AGENT_JWT)`
- `# ensure SSH keys for private repos are in ~/.ssh-mimo (mounted into agent containers as /home/app/.ssh)`
- `make daemon`

Docker Compose exposes the platform at `http://localhost:3001`.

## Usage

1. **Register/Login** at `http://localhost:3001`
2. **Create a Project** with a Git/Fossil repository URL
3. **Create an Agent** at `/agents` and copy the JWT token
4. **Start a Session** in your project
5. **Connect the Agent** using the token above

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | *required* | Change in production |
| `MIMO_HOME` | `~/.mimo` | Data directory |
| `MIMO_HOST` | `localhost` | Hostname used in generated internal URLs |
| `MIMO_LISTEN_HOST` | `MIMO_HOST` | Bind interface/host for the platform server |
| `MIMO_SHARED_FOSSIL_SERVER_HOST` | `MIMO_HOST` | Hostname used when generating shared fossil server URLs |

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for full configuration options.

## Installation from Source

Requires [Bun](https://bun.sh) 1.0+.

```bash
# Clone repository
git clone https://github.com/bit4bit/mimo.git
cd mimo

# Build agent
cd packages/mimo-agent && bun install && bun run build

# Install and run platform
cd ../mimo-platform && bun install && bun run dev
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Production deployment
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) - Configuration reference
- [docs/KEYBINDINGS.md](docs/KEYBINDINGS.md) - Keyboard shortcuts
- [AGENTS.md](AGENTS.md) - Development guidelines
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) - Common issues

## Development

```bash
# Run tests
cd packages/mimo-platform && bun test
cd ../mimo-agent && bun test

# Run with hot reload
cd packages/mimo-platform && bun run dev
```

## License

GNU Affero General Public License v3.0 only (AGPL-3.0-only)

Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
