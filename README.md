# MIMO Platform

A minimal web-based editor for AI-assisted development with structured change management.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Directory Structure](#directory-structure)
- [Development](#development)
- [License](#license)
- [Contributing](#contributing)

## Overview

MIMO (Minimal IDE for Modern Operations) is a platform that enables AI-assisted development through a web-based interface. It provides session-based development with worktrees, file synchronization, integrated chat with AI agents, and structured OpenSpec change management.

## Features

- **Public Landing Page**: View platform overview and public projects without authentication
- **Project Descriptions**: Add optional descriptions to projects for better discoverability
- **Three-Buffer Interface**: Files, Chat, and Changes panes for focused workflows
- **Session-Based Development**: Work with isolated worktrees for each development session
- **File Synchronization**: Automatic sync between agent worktree and original repository
- **Integrated Chat**: Real-time chat with AI agents via WebSocket
- **VCS Integration**: Fossil as intermediary for both Git and Fossil repositories
- **Agent Lifecycle**: Spawn and manage AI agents with JWT authentication
- **Conflict Detection**: Smart conflict detection with baseline checksums
- **Structured Change Management**: OpenSpec workflow for feature development
- **Multiple Agent Providers**: Support for Claude, OpenAI, and custom ACP agents
- **Impact Tracking**: Track agent contributions and changes through SCC integration
- **Session Persistence**: Resume sessions with chat history and file state

## Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for full architecture documentation.

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Client)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ Files Tree  │  │   Chat      │  │    Changes      │   │
│  │   (Left)    │  │  (Center)   │  │    (Right)      │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
└─────────────────────────┬─────────────────────────────────┘
                          │ WebSocket / HTTP
┌─────────────────────────▼─────────────────────────────────┐
│                 mimo-platform (Hono/Bun)                   │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Auth  │  Projects  │  Sessions  │  Agents  │ Sync │  │
│  └─────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              WebSocket Handlers                      │  │
│  │         (Chat, Agent Connections)                  │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────┬─────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────┐
│                   mimo-agent (Binary)                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         File Watcher  │  ACP Process Proxy        │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- [Bun](https://bun.sh) 1.0+
- [Fossil](https://fossil-scm.org) 2.27+
- Git (for Git repository support)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/mimo.git
cd mimo

# Install dependencies for both packages
cd packages/mimo-platform && bun install
cd ../mimo-agent && bun install
cd ..

# Start the server
cd packages/mimo-platform
bun run dev
```

The platform will be available at `http://localhost:3000`

### Build the Agent

```bash
cd packages/mimo-agent
bun install
bun run build
```

This creates `dist/mimo-agent` which is used by the platform.

## Usage

### Public Landing Page

When you first navigate to `http://localhost:3000`, you'll see a public landing page displaying:
- Platform overview and features
- List of all public projects (names, descriptions, owners, repo types)
- Login and Register buttons

Clicking on a project card will redirect you to login if not authenticated, or take you directly to the project detail if authenticated.

### Authentication

1. Navigate to `http://localhost:3000/auth/register`
2. Create an account
3. Login at `http://localhost:3000/auth/login`

### Creating a Project

1. Click "Create Project" on the projects page
2. Enter project name
3. Add an optional description (recommended ~200 chars, max 500)
4. Provide Git or Fossil repository URL
5. The system imports/clones the repository

### Starting a Session

1. Select a project from the projects list
2. Click "New Session"
3. Enter session name
4. The system sets up a Fossil worktree

### Working with Agents

1. In a session, click "Start Agent"
2. Select agent provider (Claude, OpenAI, or custom ACP agent)
3. The platform spawns an agent process
4. Chat with the agent in the center buffer
5. File changes appear in the right buffer automatically

### Committing Changes

1. Make changes through the agent
2. Click the "Commit" button
3. Enter commit message
4. Changes are committed to Fossil and pushed to the original repository

### Using OpenSpec Change Management

1. Start a new change with `/opsx:new change-name`
2. Create structured artifacts: proposal → design → specs → tasks
3. Implement tasks with `/opsx:apply change-name`
4. Verify implementation with `/opsx:verify change-name`
5. Archive completed changes with `/opsx:archive change-name`

## Configuration

Configuration is stored in `~/.mimo/config.yaml`:

```yaml
theme: dark
fontSize: 14
fontFamily: monospace
```

Edit via the web UI at `/config` or directly in the file.

## Directory Structure

```
~/.mimo/
├── config.yaml           # User configuration
├── users/
│   └── {username}/
│       └── credentials.yaml
├── projects/
│   └── {project-id}/
│       ├── project.yaml
│       ├── repo.fossil
│       ├── original/     # Original repo worktree
│       └── sessions/
│           └── {session-id}/
│               ├── session.yaml
│               ├── chat.jsonl
│               ├── repo.fossil       # Fossil proxy for agent sync
│               ├── upstream/         # Original repository clone
│               ├── agent-workspace/  # Agent working directory (plain files)
│               └── impact-history/   # Tracked changes and contributions (SCC format)
└── agents/
    └── {agent-id}/
        └── agent.yaml
```

### Session Directory Structure

Each session directory contains:

- `session.yaml` - Session metadata (name, status, port, agentWorkspacePath, upstreamPath)
- `chat.jsonl` - Chat message history
- `repo.fossil` - Fossil proxy repository for agent synchronization
- `upstream/` - Clone of the original repository (Git or Fossil)
- `agent-workspace/` - Working directory where agent makes edits (plain files, not a repository)
- `impact-history/` - Tracked changes and agent contributions (SCC format)

**Note:** The `agent-workspace/` was previously called `checkout/` but was renamed to clarify its purpose as a working directory rather than a repository checkout.

## Commit and Push Flow

When you click "Commit" in a session, the system performs a 4-step commit flow:

1. **Sync** (`fossil up`) - Synchronizes the agent-workspace with the latest changes from repo.fossil
2. **Copy** (clean slate) - Copies all files from agent-workspace to upstream/ directory, removing old files
3. **Commit** - Commits changes in the upstream/ directory with message "Mimo commit at <timestamp>"
4. **Push** - Pushes the commit to the remote repository

The commit flow preserves VCS metadata (`.git/` or `.fossil`) during the copy operation.

### Breaking Changes

**Old sessions need recreation**: Sessions created before the agent-workspace rename (v1.x) stored `checkoutPath` in session.yaml. These sessions will need to be recreated to work with the new commit flow.

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
