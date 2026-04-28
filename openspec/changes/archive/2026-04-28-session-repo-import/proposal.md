# Proposal: session-repo-import

## Why

Session creation currently creates empty worktrees without actual repository files. Agents cannot bootstrap their workspace because there's no Fossil server to clone from, and the synchronization architecture between platform and agent is not implemented. This change enables the complete session lifecycle: repository import, agent bootstrap, and bidirectional file synchronization.

## What Changes

- **Session Creation**: Clone repository to `upstream/`, import to `repo.fossil`, open fossil checkout to `checkout/`
- **Token Generation**: Remove sessionId/projectId from agent tokens; tokens only contain `{agentId, owner}`
- **Agent Repository**: Change single `sessionId` to `sessionIds` array in agent.yaml
- **API Endpoint**: Add `GET /api/agents/me/sessions` for agents to fetch assigned sessions
- **Fossil Server**: Start HTTP server per assigned session on agent connect, stop on disconnect
- **WebSocket Protocol**: Add `session_ready` message from platform to agent with port assignment
- **Agent Bootstrap**: Agent receives ports, clones from Fossil HTTP server to local workdir
- **File Sync**: Platform applies agent-reported changes to `checkout/` directory
- **Commit Flow**: Commit in fossil → export to upstream → push to remote origin
- **Directory Structure**: Rename `worktree/` to `checkout/`, add `upstream/` directory

## Capabilities

### New Capabilities

- `fossil-server`: Per-session Fossil HTTP server lifecycle management with dynamic port assignment
- `session-bootstrap`: Repository cloning, fossil import, and checkout creation during session creation
- `agent-sessions-api`: REST API for agents to discover assigned sessions with Fossil server ports

### Modified Capabilities

- `agent-lifecycle`: Token generation removes session-scoped claims; agents fetch sessions via API instead of receiving in token
- `file-sync`: Platform applies changes to `checkout/` directory instead of `worktree/`
- `session-management`: Session creation now includes repository import and checkout; adds `upstream/` and `checkout/` directories

## Impact

- **Affected Code**: 
  - `sessions/repository.ts`: Add directory creation for `upstream/` and `checkout/`
  - `sessions/routes.tsx`: Add VCS operations on session creation
  - `agents/service.ts`: Modify token generation, remove sessionId/projectId
  - `agents/repository.ts`: Change sessionId to sessionIds array
  - `vcs/index.ts`: Add Fossil HTTP server management methods
  - New API route: `GET /api/agents/me/sessions`
  - WebSocket handler: Add `session_ready` message type
  
- **Affected Storage**:
  - `sessions/<id>/session.yaml`: Add `port` field
  - `agents/<id>/agent.yaml`: Change `sessionId` to `sessionIds`
  
- **Dependencies**: Fossil SCM must be installed on platform server
  
- **Network**: Fossil HTTP servers on ports 8000-9000 per session