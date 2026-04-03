# MIMO Platform

A minimal, Emacs-style web-based editor for AI-assisted development.

## Overview

MIMO (Minimal IDE for Modern Operations) is a platform that enables AI-assisted development through a web-based interface with an Emacs-style workflow. It provides session-based development with worktrees, file synchronization, and integrated chat with AI agents.

## Features

- **Public Landing Page**: View platform overview and public projects without authentication
- **Project Descriptions**: Add optional descriptions to projects for better discoverability
- **Emacs-Style Interface**: Three-buffer layout with customizable keybindings
- **Session-Based Development**: Work with isolated worktrees for each development session
- **File Synchronization**: Automatic sync between agent worktree and original repository
- **Integrated Chat**: Real-time chat with AI agents via WebSocket
- **VCS Integration**: Fossil as intermediary for both Git and Fossil repositories
- **Agent Lifecycle**: Spawn and manage AI agents with JWT authentication
- **Conflict Detection**: Smart conflict detection with baseline checksums

## Architecture

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

# Install dependencies
cd packages/mimo-platform
bun install

# Start the server
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
2. The platform spawns an agent process
3. Chat with the agent in the center buffer
4. File changes appear in the right buffer automatically

### Committing Changes

1. Make changes through the agent
2. Click "Commit" button or press `C-x c`
3. Enter commit message
4. Changes are committed to Fossil and pushed to the original repository

## Configuration

Configuration is stored in `~/.mimo/config.yaml`:

```yaml
theme: dark
fontSize: 14
fontFamily: monospace
keybindings:
  cancel_request: "C-c C-c"
  commit: "C-x c"
  find_file: "C-x C-f"
  switch_project: "C-x p"
  switch_session: "C-x s"
  focus_left: "C-x h"
  focus_center: "C-x j"
  focus_right: "C-x l"
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
│               └── chat.jsonl
└── agents/
    └── {agent-id}/
        └── agent.yaml
```

## Development

```bash
# Run tests
bun test

# Run with hot reload
bun run dev

# Build for production
bun run build
```

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please read CONTRIBUTING.md for guidelines.
