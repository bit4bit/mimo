## Context

Session creation currently creates empty directories without repository files. Agents cannot bootstrap their workspace because:

1. No repository import happens during session creation
2. No Fossil HTTP server runs for agents to clone from
3. Tokens include sessionId/projectId but agents don't know where to work
4. Directory structure uses `worktree/` instead of `checkout/`/`upstream/`

The platform uses Fossil as an intermediary between Git/Fossil upstream repositories and agent workspaces. This design enables agents to clone, work, and sync changes uniformly regardless of the original VCS.

### Current State

- `projects/<id>/project.yaml`: Only stores metadata (repoUrl, repoType)
- `sessions/<id>/session.yaml`: Has assignedAgentId but no port
- `sessions/<id>/worktree/`: Empty directory
- `agents/<id>/agent.yaml`: Has single `sessionId` field
- `agents/service.ts`: Generates tokens with `{agentId, owner}` only
- Token you provided has `{agentId, sessionId, projectId, owner}` - generated elsewhere

### Constraints

- Fossil must be installed on platform server
- Port range 8000-9000 for Fossil HTTP servers
- Agent-token authentication via JWT
- One agent can have multiple sessions (1:many)
- Platform `checkout/` is source of truth for file sync

## Goals / Non-Goals

**Goals:**
- Session creation clones repo → imports to Fossil → opens checkout
- Fossil server starts on agent connect, stops on disconnect
- Agent fetches sessions via `GET /api/agents/me/sessions`
- Agent clones from `http://platform:port` to local workdir
- Platform applies agent changes to `checkout/`
- User commits from `checkout/` → exports to `upstream/` → pushes

**Non-Goals:**
- Bi-directional sync from upstream to Fossil proxy (one-time import only)
- Real-time file watching from platform
- Multi-user session collaboration

## Decisions

### 1. Session Directory Structure

**Decision:** Use three directories per session:

```
sessions/<session-id>/
├── session.yaml      # metadata + port
├── upstream/         # original repo (git clone or fossil clone)
├── repo.fossil       # fossil proxy (one-time import)
└── checkout/         # working copy (fossil open)
```

**Rationale:**
- `upstream/` preserves original repository for pushing
- `repo.fossil` isolates agent work from upstream
- `checkout/` is canonical for file sync and commits

**Alternative:** Single Fossil repo with push back to upstream
- **Rejected:** Requires bidirectional sync, more complex

### 2. Fossil Server Lifecycle

**Decision:** Start/stop per session on agent connect/disconnect.

```
Agent connects → fetch sessions → start fossil servers → send ports
Agent disconnects → stop fossil servers → release ports
```

**Rationale:**
- No server running = no resource waste when idle
- Agent-driven lifecycle = clear ownership
- Platform tracks port assignments in memory (could persist to session.yaml later)

**Alternative:** Start on session creation, stop on session delete
- **Rejected:** Wastes ports when session has no active agent

### 3. Token Design

**Decision:** Tokens contain only `{agentId, owner}`.

```typescript
const token = await new SignJWT({ 
  agentId: agent.id, 
  owner: agent.owner 
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("24h")
  .sign(secret);
```

**Rationale:**
- One agent can have multiple sessions
- Session assignments change dynamically
- Agent fetches current sessions via API

**Alternative:** Token includes sessionIds array
- **Rejected:** Requires re-issuing token when sessions assigned/unassigned

### 4. Agent Session Discovery

**Decision:** REST API `GET /api/agents/me/sessions`.

```typescript
// Response
[
  {
    sessionId: "...",
    projectId: "...",
    sessionName: "fix-auth-bug",
    status: "active",
    port: 8042
  }
]
```

**Rationale:**
- Simple REST call on agent startup and after connect
- No state in token, all state in API
- Can add filtering/pagination later

**Alternative:** WebSocket message with session list
- **Rejected:** REST is simpler for one-time fetch; WebSocket for real-time updates

### 5. Commit Flow

**Decision:** Three-step commit: fossil commit → export to upstream → push to remote.

```
checkout/ (fossil) → repo.fossil → upstream/ → remote
```

```bash
# In checkout/
fossil commit -m "message"

# Export to upstream
cd ../upstream
fossil export --git ../repo.fossil | git apply

# Push
git push origin main
```

**Rationale:**
- Fossil tracks all changes in `repo.fossil`
- `upstream/` stays in sync for push to origin
- Conflicts detected during `fossil export`

**Alternative:** Direct git commit in upstream, sync to fossil
- **Rejected:** Loses fossil benefits (audit trail, simpler merge)

### 6. Port Management

**Decision:** In-memory port pool with collision detection.

```typescript
const PORT_RANGE = { start: 8000, end: 9000 };
const portsInUse = new Set<number>();

function assignPort(): number | null {
  for (let port = PORT_RANGE.start; port <= PORT_RANGE.end; port++) {
    if (!portsInUse.has(port)) {
      portsInUse.add(port);
      return port;
    }
  }
  return null; // Exhausted
}
```

**Rationale:**
- Simple implementation
- Restart-safe (ports released on process restart)
- 1000 sessions supported

**Alternative:** Persist ports in session.yaml
- **Rejected:** Complexity for little benefit; ports released on restart anyway

## Risks / Trade-offs

**[Risk]** Port exhaustion with many sessions
→ **Mitigation:** 1000 ports (8000-9000) is high limit; monitor usage; error clearly

**[Risk]** Fossil server crashes leave orphaned processes
→ **Mitigation:** Track PIDs, kill on disconnect, health checks

**[Risk]** Agent disconnect doesn't stop server
→ **Mitigation:** 30-second grace period, then force stop; log warnings

**[Risk]** Clone fails mid-session creation
→ **Mitigation:** Rollback: delete partial session directory, return error

**[Risk]** Git pushes conflict with upstream changes
→ **Mitigation:** User must pull/merge in `upstream/` before push; platform shows git error

**[Trade-off]** One-time import means `repo.fossil` diverges from upstream
→ User can't pull new upstream changes into session; each session is isolated

**[Trade-off]** No persistent port assignments
→ Sessions lose port on platform restart; agents must reconnect

## Open Questions

1. **Should `upstream/` be lazily cloned on first commit?**
   - Currently: clone on session creation (upfront cost)
   - Alternative: clone only when user commits
   - **Decision:** Upfront clone - simpler, predictable

2. **How to handle `upstream/` pushing for Fossil repos?**
   - Git: `git push origin main`
   - Fossil: `fossil push URL`
   - **Decision:** VCS service handles both cases

3. **Should session.yaml persist `port` field?**
   - Current: in-memory only
   - Alternative: persist for debugging/inspection
   - **Decision:** Persist for observability