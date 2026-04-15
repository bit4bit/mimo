# MIMO Platform

My Opinionated Agent development environment, this is a tool for my daily activities and also my training dojo for tuning my usage of LLM.

A web-based interface for AI-assisted development with session-based worktrees, structured change management, and multi-provider agent support.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Directory Structure](#directory-structure)
- [Development](#development)
- [License](#license)
- [Contributing](#contributing)

## Overview

MIMOis a platform that enables AI-assisted development through a web-based interface. It provides session-based development with worktrees-like, file synchronization, integrated chat with AI agents, session parking for resource management, MCP server integration, and structured OpenSpec change management.

## Features

- **Two-Frame Interface**: Chat (left), Notes/Impact/MCP (right) buffers
- **Public Landing Page**: View platform overview and public projects without authentication
- **Dashboard**: Authenticated view of your projects, agents, and recent sessions
- **Session-Based Development**: Work with isolated Fossil worktrees for each development session
- **Session Parking**: Automatic idle timeout (configurable) that terminates idle ACP processes to free resources, with transparent wake-up on next prompt
- **File Synchronization**: Automatic sync between agent workspace and original repository via Fossil intermediary
- **Integrated Chat**: Real-time streaming chat with AI agents via WebSocket (thoughts, messages, usage)
- **VCS Integration**: Fossil as intermediary for both Git and Fossil repositories, with shared fossil server
- **Agent Providers**: Support for Opencode and Claude ACP providers with model/mode selection
- **VCS Credentials**: Manage HTTPS and SSH credentials for repository access
- **MCP Server Support**: Configure and attach MCP (Model Context Protocol) servers to sessions (stdio, HTTP, SSE transports)
- **Impact Tracking**: Track file changes, lines of code, complexity metrics (via SCC), and code duplication (via jscpd)
- **Auto-Commit with Duplication Thresholds**: Auto-sync on thought completion with configurable warning (15%) and block (30%) duplication thresholds
- **Model & Mode Selection**: Per-session model and mode selection, persisted and restored across session parking
- **Session Clear**: Reset ACP context while preserving chat history
- **Permission Requests**: Route tool approval from agent through chat UI
- **Notes Buffer**: Per-session scratch notes
- **Frame State Persistence**: Buffer selection persisted per session
- **Conflict Detection**: Smart conflict detection with baseline checksums
- **Structured Change Management**: OpenSpec workflow for feature development

## Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for full architecture documentation.

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Client)                       │
│  ┌─────────────┐  ┌────────────────────────────────────┐   │
│  │    Chat      │  │  Notes  │  Impact  │  MCP Server   │   │
│  │  (Left)     │  │            (Right)                  │   │
│  └─────────────┘  └────────────────────────────────────┘   │
└─────────────────────────┬─────────────────────────────────┘
                          │ WebSocket / HTTP
┌─────────────────────────▼─────────────────────────────────┐
│                 mimo-platform (Hono/Bun)                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Auth │ Projects │ Sessions │ Agents │ Credentials │  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ MCP Servers │ Impact │ Auto-Commit │ Sync │ Commits│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────┬─────────────────────────────────┘
                          │ WebSocket (JWT auth)
┌─────────────────────────▼─────────────────────────────────┐
│                   mimo-agent (Binary)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  SessionLifecycleManager  │  File Watcher            │   │
│  │  (ACTIVE/PARKED/WAKING)  │  (change batching)       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ACP Client  │  Opencode Provider  │  Claude Provider│  │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- [Bun](https://bun.sh) 1.0+
- [Fossil](https://fossil-scm.org) 2.27+
- Git (for Git repository support)
- [opencode](https://opencode.ai) CLI (if using opencode ACP provider)
- [claude-agent-acp](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp) CLI (if using Claude ACP provider)
- [scc](https://github.com/boyter/scc) (optional, for code complexity metrics - auto-installed)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/mimo.git
cd mimo

# Build the agent binary
cd packages/mimo-agent
bun install
bun run build

# Install platform dependencies
cd ../mimo-platform
bun install

# Start the platform
bun run dev
```

The platform will be available at `http://localhost:3000`

### Running an Agent

```bash
# After building the agent (see above)
cd packages/mimo-agent

# Run with opencode provider
./dist/mimo-agent --token <AGENT_JWT> --platform ws://localhost:3000/ws/agent --provider opencode

# Run with claude provider
./dist/mimo-agent --token <AGENT_JWT> --platform ws://localhost:3000/ws/agent --provider claude
```

## Usage

### Public Landing Page & Dashboard

- **Unauthenticated**: Navigate to `http://localhost:3000` to see the landing page with public projects overview
- **Authenticated**: After login, you're redirected to `/dashboard` showing your projects, agents, and recent sessions

### Authentication

1. Click "Register" on the landing page or navigate to `/auth/register`
2. Create an account (username + password)
3. Login at `/auth/login` (JWT cookie, 24h expiry)

### Creating a Project

1. Click "Create Project" on the projects or dashboard page
2. Enter project name and optional description (~200 chars recommended, max 500)
3. Provide Git or Fossil repository URL
4. Optionally add VCS credentials (HTTPS or SSH) at `/credentials`
5. The system imports/clones the repository

### Starting a Session

1. Select a project and click "New Session"
2. Enter session name
3. Optionally configure: assigned agent, branch, local dev mirror, agent subpath, MCP servers
4. The system sets up a Fossil worktree and checkout

### Working with Agents

1. Create an agent at `/agents/new` (Opencode or Claude provider)
2. Copy the agent JWT token
3. Start the agent binary: `./mimo-agent --token <TOKEN> --platform ws://HOST:3000/ws/agent --provider <opencode|claude>`
4. Chat with the agent in the left buffer (streaming thoughts, messages, usage stats)
5. Select model and mode per session (persisted across parking)
6. Tool permission requests are routed through the chat UI for approval

### Session Parking

Sessions automatically park after a configurable idle timeout (default: 10 minutes):
- **Active**: Normal operation, ACP process running
- **Parked**: ACP process terminated to free resources
- **Waking**: New prompt received, ACP process respawning with session resumption

Configure idle timeout via session settings (`/sessions/:id/settings`) or API (`PATCH /sessions/:id/config`).

### Impact & Auto-Commit

- The Impact buffer shows file changes, lines of code, complexity metrics, and duplication
- Auto-commit triggers on `thought_end` events with configurable duplication thresholds:
  - **Warning** (default 15%): Appends `[duplication: X%]` to commit message
  - **Block** (default 30%): Prevents commit, notifies user

### Using OpenSpec Change Management

1. Start a new change with `/opsx:new change-name`
2. Create structured artifacts: proposal → design → specs → tasks
3. Implement tasks with `/opsx:apply change-name`
4. Verify implementation with `/opsx:verify change-name`
5. Archive completed changes with `/opsx:archive change-name`

## Configuration

Configuration is stored in `~/.mimo/config.yaml`:

```yaml
theme: dark                  # "dark" or "light"
fontSize: 14                 # 8-32
fontFamily: monospace
sharedFossilServerPort: 8000 # Shared fossil server port
streamingTimeoutMs: 600000   # Streaming timeout (10 min default)
```

Edit via the web UI at `/config` or directly in the file.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Platform HTTP port |
| `PLATFORM_URL` | `http://localhost:<PORT>` | Platform URL for agent connections |
| `JWT_SECRET` | `your-secret-key-change-in-production` | **Must be changed in production** |
| `MIMO_HOME` | `~/.mimo` | Base data directory |
| `FOSSIL_REPOS_DIR` | `~/.mimo/session-fossils` | Centralized fossil repository storage |
| `MIMO_SHARED_FOSSIL_SERVER_PORT` | `8000` | Shared fossil server port |

## Directory Structure

```
~/.mimo/
├── config.yaml              # Platform configuration
├── session-fossils/         # Centralized fossil repo files
│   └── {normalized-session-id}.fossil
├── users/
│   └── {username}/
│       └── credentials.yaml
├── projects/
│   └── {project-id}/
│       ├── project.yaml
│       └── sessions/
│           └── {session-id}/
│               ├── session.yaml
│               ├── chat.jsonl
│               ├── upstream/            # Clone of original repository
│               ├── agent-workspace/     # Fossil checkout where agent works
│               ├── patches/             # Historical patch storage
│               └── impact-history/      # Tracked changes (SCC format)
├── agents/
│   └── {agent-id}/
│       └── agent.yaml
└── mcp-servers/
    └── {server-slug}.yaml
```

### Session Directory Structure

Each session directory contains:

- `session.yaml` - Session metadata (name, status, assignedAgentId, acpSessionId, modelState, modeState, frameState, idleTimeoutMs)
- `chat.jsonl` - Chat message history (thoughts, messages, usage)
- `upstream/` - Clone of the original repository (Git or Fossil)
- `agent-workspace/` - Fossil checkout where agent makes edits
- `patches/` - Historical patch storage
- `impact-history/` - Tracked changes and agent contributions (SCC format)

## Commit and Push Flow

When you commit in a session, the system performs a multi-step flow via the shared Fossil server:

1. **Sync** - Synchronizes agent-workspace with latest changes from the shared fossil repository
2. **Copy** - Copies changed files from agent-workspace to upstream/ directory
3. **Commit** - Commits changes in the upstream/ directory
4. **Push** - Pushes the commit to the remote repository

Auto-commit can trigger automatically on `thought_end` events with duplication threshold enforcement.

## Development

See [AGENTS.md](./AGENTS.md) for development philosophy and OpenSpec workflow.

```bash
# Run tests
cd packages/mimo-platform && bun test
cd ../mimo-agent && bun test

# Run with hot reload
cd packages/mimo-platform
bun run dev

# Build for production
cd packages/mimo-platform && bun run build
cd ../mimo-agent && bun run build
```

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Follow the OpenSpec workflow for structured development:

1. Use `/opsx:explore topic` to investigate requirements
2. Create change artifacts with `/opsx:new change-name` or `/opsx:ff change-name`
3. Implement tasks with `/opsx:apply change-name`
4. Verify and archive changes when complete

See [AGENTS.md](./AGENTS.md) for detailed development guidelines and commit conventions.

## Additional Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System architecture and components
- [CONFIGURATION.md](./docs/CONFIGURATION.md) - Configuration options and file structure
- [KEYBINDINGS.md](./docs/KEYBINDINGS.md) - Keyboard interactions reference
- [MIMO_AGENT.md](./docs/MIMO_AGENT.md) - Agent binary implementation details
- [DEPLOYMENT.md](./docs/DEPLOYMENT.md) - Deployment considerations
- [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) - Common issues and solutions
