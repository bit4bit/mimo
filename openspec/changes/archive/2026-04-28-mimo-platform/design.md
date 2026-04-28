# Design: mimo-platform

## Context

The goal is to build a minimal, Emacs-style web editor for collaborative AI-assisted development. The system avoids databases entirely, using the filesystem as the single source of truth. The architecture uses Fossil as an intermediary layer between original repositories (Git or Fossil) and the agent's worktree, allowing consistent cloning and synchronization regardless of the original VCS.

### Current State
This is a greenfield project with no existing codebase to extend.

### Constraints
- **No database**: Everything stored in YAML/JSONL files
- **Single-file agent**: mimo-agent must compile to one Bun executable
- **Filesystem-driven**: Projects, sessions, and chat history are directories and files
- **Emacs-style UI**: Keyboard-driven, buffers, minimal chrome
- **ACP Protocol**: Agent communication via stdio through proxy

## Goals / Non-Goals

**Goals:**
- Build minimal TypeScript/Bun platform with filesystem-based state
- Support Git and Fossil repositories seamlessly
- One Fossil server per session with auto-assigned ports
- Agent persists across disconnects
- Emacs-inspired UI with file/chat/changes buffers
- Keybindings: C-c C-c to cancel, C-x c to commit

**Non-Goals:**
- Multi-user sessions (single user per session)
- Conflict auto-resolution (manual only)
- Real-time collaborative editing
- Email confirmation for auth
- React/Vue client-side framework

## Decisions

### 1. Fossil as Intermediary Layer
**Decision:** Import all repositories (Git or Fossil) into Fossil for session management.

**Rationale:**
- Fossil supports both Git import and native operation
- Provides consistent HTTP cloning interface for agents
- Self-contained with built-in server
- Simplifies mimo-agent (always clones from Fossil HTTP)

**Alternative:** Native Git worktrees with Fossil worktree simulation
- **Rejected:** Added complexity in mimo-agent to handle different VCS

### 2. Platform Architecture
**Decision:** Build platform using TypeScript/Bun with Hono framework for minimal footprint.

**Rationale:**
- Single language stack (TypeScript for both platform and agent)
- Fast startup and low memory footprint
- Bun built-in WebSocket support
- Simple, minimal dependencies

**Framework Decision:** Hono - minimal, fast, works great with Bun, JSX support for server-side rendering

**Alternative:** Phoenix (Elixir)
- **Rejected:** Too heavy for this use case, TypeScript provides sufficient concurrency with Bun

### 3. Filesystem Structure
**Decision:** Use YAML for config, JSONL for append-only logs.

```
~/.mimo/
├── users/<name>/credentials.yaml
├── projects/<id>/
│   ├── project.yaml
│   └── sessions/<session-id>/
│       ├── session.yaml
│       ├── chat/messages.jsonl
│       ├── repo.fossil
│       └── worktree/
└── agents/
    └── <agent-id>/
        └── agent.yaml
```

**Rationale:**
- Human-readable for debugging
- JSONL allows streaming append without rewriting
- Directory structure mirrors domain model

**Alternative:** SQLite single file
- **Rejected:** User explicitly wants no database

### 4. Agent Architecture
**Decision:** Single-file Bun executable with embedded ACP SDK.

**Rationale:**
- Easy distribution (single binary ~50MB)
- TypeScript for type safety
- Built-in file watching (Bun.watch)

**Alternative:** Deno compile
- **Rejected:** Bun has better npm compatibility for @agentclientprotocol/sdk

### 5. UI Architecture
**Decision:** Server-side rendered HTML using Hono's JSX support.

**Rationale:**
- Minimal client-side JavaScript (only for WebSocket and keybindings)
- Type-safe templates with TypeScript JSX
- No build step for frontend assets
- Fast server-side rendering
- Emacs-style interface with vanilla JS for interactivity

**UI Library Options:**
- **Hono JSX**: Type-safe, server-rendered, minimal
- **HTMX**: HTML-over-the-wire, but adds dependency
- **Alpine.js**: Lightweight reactivity, but more JS
- **Vanilla JS**: Maximum minimalism

**Decision:** Hono JSX for rendering + vanilla JS for WebSocket/keybindings

**Layout:**
```
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────────┐
│    File Buffer (Left)        │    Chat Buffer (Center)      │    Changes Buffer (Right)    │
│                              │                              │                              │
│  src/                        │  user> Add dark mode         │  M src/app.js                │
│    app.js [M]                │  agent> I'll help...         │  ? src/new.ts                │
│    lib/                      │       [streaming...]         │  D src/old.js                │
│      auth.js [M]             │                              │                              │
│    styles/                   │  >                           │                              │
│                              │                              │                              │
├──────────────────────────────┴──────────────────────────────┴──────────────────────────────┤
│ Status: C-c C-c cancel | C-x c commit | C-x C-f find-file | C-x p project | C-x s session  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Keybindings (Configurable):**
Default bindings stored in `~/.mimo/config.yaml`:

```yaml
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

Users can customize via settings UI or by editing config file.

**Alternative:** Tab-based interface
- **Rejected:** Not Emacs-style

### 6. Authentication
**Decision:** Simple BCrypt hashed passwords in YAML, JWT tokens for sessions.

**Rationale:**
- No email required (user constraint)
- JWT is stateless (no DB session store)
- Platform generates token, passes to agent via CLI

## Risks / Trade-offs

**[Risk]** Fossil server port conflicts
→ **Mitigation:** Auto-assign from range 8000-9000 with collision detection

**[Risk]** Agent crashes leave orphaned processes
→ **Mitigation:** Platform monitors WebSocket, kills agent on disconnect; agent kills ACP child on exit

**[Risk]** Large chat histories slow down session load
→ **Mitigation:** JSONL allows streaming load, pagination for display

**[Risk]** Fossil clone for each session consumes disk
→ **Mitigation:** Expected behavior, sessions are temporary workspaces

**[Risk]** Conflict detection between agent and original repo
→ **Mitigation:** Platform shows conflict status, requires manual resolution

**[Trade-off]** No real-time file watching from platform
→ Platform relies on agent to report changes, slight delay but simpler

## Migration Plan

Not applicable (greenfield project).

## Open Questions

1. Should fossil server use SQLite or in-memory for session repos?
   - **Decision:** SQLite for persistence across platform restarts

2. How to handle agent binary updates?
   - **Decision:** Separate download, check version on spawn

3. Port range exhaustion with many sessions?
   - **Decision:** 8000-9000 = 1000 ports, reasonable limit

4. Chat message format?
   - **Decision:** {type: "user"|"agent", content: string, timestamp: ISO8601, metadata?: object}
