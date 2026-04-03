# Proposal: mimo-platform

## Why

Emacs is outdated for modern collaborative development. We need a web-based editor that combines the power of worktree-based development with AI agents, allowing users to chat with agents that code while maintaining full version control. Unlike traditional IDEs, this should be minimal, text-focused, and filesystem-driven—no databases, no bloat, just Emacs-style efficiency in the browser.

## What Changes

- **New System**: Build mimo-platform using TypeScript/Bun with Elysia framework for minimal footprint
- **Auth System**: Simple username/password login/logout without email confirmation, stored in YAML files
- **Project Management**: Create projects, link to Git/Fossil repositories, switch between projects
- **Session Management**: Create sessions with titles that spawn worktrees, chat interface with streaming responses, file tree with change indicators, syntax-highlighted diffs
- **Agent Management**: Create agents that generate tokens, spawn mimo-agent processes that proxy ACP protocol, list active agents
- **VCS Integration**: Support both Git (native worktrees) and Fossil (virtual worktree via multiple clones), commit and push to remote
- **mimo-agent**: Build separate TypeScript/Bun single-file executable that connects via WebSocket, clones from Fossil server, proxies ACP, watches files, and reports changes
- **UI Style**: Emacs-inspired minimal interface with buffers, keybindings, split windows

## Capabilities

### New Capabilities
- `user-auth`: Simple username/password authentication, filesystem-based credential storage
- `project-management`: CRUD operations for projects, repository linking, project switching
- `session-management`: Session CRUD with worktree creation, chat with streaming, file viewing with syntax highlighting
- `agent-lifecycle`: Agent creation with token generation, process spawning, connection management
- `vcs-integration`: Git and Fossil repository support, worktree management, commit/push operations
- `file-sync`: Bidirectional file synchronization between agent worktree and original repository

### Modified Capabilities
- None

## Impact

- **New Dependencies**: Elixir/Phoenix, Hologram, Bun (for agent build), Fossil
- **Filesystem Structure**: Creates `~/.mimo/` directory structure for projects, sessions, and chat history
- **Network**: WebSocket connections between browser-platform-agent
- **Processes**: Fossil server per session, mimo-agent process per session
- **Distribution**: mimo-agent as separate downloadable binary
