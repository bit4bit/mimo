# Tasks: mimo-platform

## 1. Platform Project Setup

- [ ] 1.1 Initialize Bun project with TypeScript (`bun init`)
- [ ] 1.2 Add Hono dependency (`bun add hono`)
- [ ] 1.3 Add @hono/node-server for Bun compatibility
- [ ] 1.4 Configure TypeScript compiler options (tsconfig.json)
- [ ] 1.5 Set up filesystem paths for ~/.mimo/ storage
- [ ] 1.6 Create project structure (src/, public/, etc.)
- [ ] 1.7 Set up development scripts (bun run dev, bun run build)
- [ ] 1.8 Create basic Hono server with JSX support
- [ ] 1.9 Set up JSX factory for Hono

## 2. Authentication System

- [ ] 2.1 Create filesystem-based user storage (users/<name>/credentials.yaml)
- [ ] 2.2 Add bcrypt dependency for password hashing
- [ ] 2.3 Implement JWT token generation and validation (jose or jsonwebtoken)
- [ ] 2.4 Build login endpoint (POST /api/auth/login)
- [ ] 2.5 Build registration endpoint (POST /api/auth/register)
- [ ] 2.6 Create JWT middleware for protected routes
- [ ] 2.7 Implement logout endpoint
- [ ] 2.8 Build login/registration pages using Hono JSX

## 3. Project Management

- [ ] 3.1 Create Project service module for CRUD operations
- [ ] 3.2 Build project filesystem structure (projects/<id>/)
- [ ] 3.3 Implement project.yaml serialization (js-yaml)
- [ ] 3.4 Create REST endpoints (GET, POST, DELETE /api/projects)
- [ ] 3.5 Build project list HTML page
- [ ] 3.6 Build project creation form
- [ ] 3.7 Add Git/Fossil URL validation
- [ ] 3.8 Implement project deletion with cleanup
- [ ] 3.9 Create project switcher UI component

## 4. VCS Integration

- [ ] 4.1 Install Fossil CLI dependency check
- [ ] 4.2 Build VCS abstraction module (Git/Fossil operations)
- [ ] 4.3 Implement Git import to Fossil (`fossil import --git`)
- [ ] 4.4 Implement Fossil clone operation
- [ ] 4.5 Create Fossil server management module
- [ ] 4.6 Build port auto-assignment logic (8000-9000 range)
- [ ] 4.7 Implement Fossil server lifecycle (start/stop via spawn)
- [ ] 4.8 Add Fossil server health checks

## 5. Session Management

- [ ] 5.1 Create Session service module
- [ ] 5.2 Build session filesystem structure (projects/<id>/sessions/<id>/)
- [ ] 5.3 Implement session.yaml serialization
- [ ] 5.4 Create REST endpoints for session CRUD
- [ ] 5.5 Build session view with three-buffer layout using Hono JSX
- [ ] 5.6 Implement JSONL chat history storage
- [ ] 5.7 Build WebSocket endpoint for chat streaming (/ws/session/:id)
- [ ] 5.8 Create file tree component with change indicators
- [ ] 5.9 Implement file diff viewer with syntax highlighting
- [ ] 5.10 Add session deletion with full cleanup
- [ ] 5.11 Build session reconnect logic

## 6. Agent Lifecycle

- [x] 6.1 Create Agent service module
- [x] 6.2 Build agent filesystem structure (agents/<id>/)
- [x] 6.3 Implement JWT token generation for agents
- [x] 6.4 Create agent process spawning (Bun.spawn)
- [x] 6.5 Build WebSocket endpoint for agent connections (/ws/agent)
- [x] 6.6 Implement agent authentication via JWT
- [x] 6.7 Create agent status tracking
- [x] 6.8 Build agent list page
- [x] 6.9 Implement ACP request cancellation (C-c C-c)
- [x] 6.10 Implement agent termination command
- [x] 6.11 Add agent crash detection and cleanup

## 7. File Synchronization

- [x] 7.1 Build file change listener (WebSocket from agent)
- [x] 7.2 Implement file copy from session worktree to original repo
- [x] 7.3 Create conflict detection logic
- [x] 7.4 Build conflict resolution UI
- [x] 7.5 Implement batch sync on reconnect
- [x] 7.6 Add file deletion handling
- [x] 7.7 Build manual sync from original repo to session

## 8. Emacs-Style UI

- [x] 8.1 Create base HTML layout with three vertical buffers
- [x] 8.2 Implement keybinding system (C-x, C-c prefixes) in vanilla JS
- [x] 8.3 Add C-c C-c for cancel current request
- [x] 8.4 Add C-x c for commit and push
- [x] 8.5 Add C-x C-f for find file
- [x] 8.6 Add C-x p for switch project
- [x] 8.7 Add C-x s for switch session
- [x] 8.8 Add C-x h/j/l for buffer focus (left/center/right)
- [x] 8.9 Build status line component
- [x] 8.10 Implement buffer switching
- [x] 8.11 Create file tree component with [M]/[?]/[!] indicators
- [x] 8.12 Load keybindings from ~/.mimo/config.yaml

## 9. Chat System

- [x] 9.1 Create Chat service module
- [x] 9.2 Build message serialization to JSONL
- [x] 9.3 Implement chat history loading (streaming from JSONL)
- [x] 9.4 Create chat input component
- [x] 9.5 Build chat message display (user/agent)
- [x] 9.6 Implement streaming message display (WebSocket)
- [x] 9.7 Add chat replay functionality

## 10. Commit and Push

- [x] 10.1 Implement Fossil commit from session worktree
- [x] 10.2 Build commit message input UI
- [x] 10.3 Create export to Git functionality (for Git repos)
- [x] 10.4 Implement push to Git remote
- [x] 10.5 Implement push to Fossil remote
- [x] 10.6 Add push confirmation dialog
- [x] 10.7 Handle push errors and conflicts with detailed messages

## 11. mimo-agent (TypeScript/Bun)

- [ ] 11.1 Set up Bun project with TypeScript (packages/mimo-agent/)
- [ ] 11.2 Add @agentclientprotocol/sdk dependency
- [ ] 11.3 Implement CLI argument parsing (--token, --platform)
- [ ] 11.4 Build WebSocket client for platform connection (ws library)
- [ ] 11.5 Implement Fossil clone from platform
- [ ] 11.6 Create ACP agent spawning (Bun.spawn) and stdio proxy
- [ ] 11.7 Build file watcher (Bun.watch native)
- [ ] 11.8 Implement change reporting to platform
- [ ] 11.9 Implement ACP request cancellation handling
- [ ] 11.10 Add graceful shutdown handling
- [ ] 11.11 Create single-file build (`bun build --compile`)
- [ ] 11.12 Write agent documentation

## 12. Configuration System

- [ ] 12.1 Create config.yaml loader/parser
- [ ] 12.2 Define default configuration structure
- [ ] 12.3 Implement keybinding customization
- [ ] 12.4 Add config validation
- [ ] 12.5 Create config editor UI

## 13. Integration and Testing

- [ ] 13.1 End-to-end test: full user flow
- [ ] 13.2 Test authentication (login/logout)
- [ ] 13.3 Test project CRUD operations
- [ ] 13.4 Test session lifecycle
- [ ] 13.5 Test agent spawning and communication
- [ ] 13.6 Test file synchronization
- [ ] 13.7 Test commit and push flows
- [ ] 13.8 Test disconnect/reconnect scenarios
- [ ] 13.9 Test error handling and recovery
- [ ] 13.10 Performance testing with large chat histories
- [ ] 13.11 Test ACP request cancellation

## 14. Documentation

- [ ] 14.1 Write README with installation instructions
- [ ] 14.2 Document Emacs keybindings
- [ ] 14.3 Create architecture diagram
- [ ] 14.4 Write deployment guide
- [ ] 14.5 Document mimo-agent usage
- [ ] 14.6 Create troubleshooting guide
- [ ] 14.7 Document configuration options
