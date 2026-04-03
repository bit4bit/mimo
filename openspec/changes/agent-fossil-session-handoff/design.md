# Design: agent-fossil-session-handoff

## Context

### Current State
- Platform creates checkout directory during session creation (`sessions/routes.tsx:157-166`)
- Fossil server starts when agent connects, not during session creation
- Agent sends `agent_ready` on connect but never handles `session_ready`
- Agent uses `--workdir` CLI arg for file watching, no per-session paths
- `@agentclientprotocol/sdk` is not installed despite task marked complete

### Problem
The agent receives `{sessionId, port}` but lacks:
1. Checkout path (relative to workdir)
2. Platform URL for fossil clone
3. Handler for `session_ready` message
4. Multi-session management

### Constraints
- Agent must support multiple concurrent sessions
- Checkout paths must be relative to agent workdir for portability
- Platform may be remote (not always localhost)
- One fossil server per session, one ACP process per session

## Goals / Non-Goals

**Goals:**
- Agent receives complete session info on connect
- Agent clones from fossil proxy to create checkout
- Agent spawns ACP process per session
- Agent maintains multi-session state
- Platform stops creating checkout during session bootstrap

**Non-Goals:**
- Real-time session addition/removal (future: agent would need to handle `session_added`/`session_removed` messages)
- Session migration between agents
- ACP process multiplexing (one ACP per session is the model)

## Decisions

### 1. Session Handoff Protocol

**Decision:** Single `session_ready` message with complete session array

**Rationale:**
- Simpler state management
- Agent can batch initialize all sessions
- Avoids race conditions with incremental messages
- Consistent with existing message patterns

**Message Structure:**
```json
{
  "type": "session_ready",
  "platformUrl": "http://localhost:3000",
  "sessions": [
    {
      "sessionId": "uuid-1",
      "port": 8080
    },
    {
      "sessionId": "uuid-2",
      "port": 8081
    }
  ]
}
```

**Note:** Agent uses `{workdir}/{sessionId}` as checkout path. Platform doesn't need to compute or send checkout paths.

**Alternative considered:** Send checkoutPath in message
- Rejected: More complex, requires path coordination between platform and agent

### 2. Checkout Path Strategy

**Decision:** Agent derives checkout path from sessionId and workdir

**Rationale:**
- Simple: `{workdir}/{sessionId}` is deterministic
- Platform doesn't need to know agent's workdir
- No path coordination required
- Agent has full control over checkout location

**Implementation:**
```typescript
// Agent side
const checkoutPath = join(workdir, sessionId);
```

**Alternative considered:** Platform sends relative checkoutPath
- Rejected: Unnecessary coordination between platform and agent

### 3. Multi-Session Architecture

**Decision:** Map<sessionId, SessionContext> with per-session ACP process

**Rationale:**
- Clean separation between sessions
- Each session has independent ACP lifecycle
- File watcher per session enables concurrent work

**Data Structure:**
```typescript
interface SessionContext {
  sessionId: string;
  checkoutPath: string;
  fossilUrl: string;      // http://localhost:<port>
  acpProcess: ChildProcess | null;
  fileWatcher: FSWatcher | null;
}

private sessions: Map<string, SessionContext> = new Map();
```

### 4. Bootstrap Sequence

**Decision:** Sequential clone → ACP spawn per session

**Sequence:**
```
session_ready received
│
├─ For each session:
│   ├─ Clone fossil → checkoutPath
│   │   fossil clone http://localhost:<port> <checkoutPath>
│   │
│   ├─ Spawn ACP in checkoutPath
│   │   ACP process runs in session context
│   │
│   ├─ Start file watcher on checkoutPath
│   │
│   └─ Store in sessions map
│
└─ Send agent_sessions_ready to platform
```

**Error handling:** If clone fails for one session, log error, continue others, report failures

### 5. ACP Integration

**Decision:** Use `@agentclientprotocol/sdk` for ACP communication

**Rationale:**
- Standard protocol implementation
- Handles message framing
- Already mentioned in tasks

**Alternative:** Custom stdio framing
- Rejected: Reinventing wheel, SDK handles edge cases

## Risks / Trade-offs

**[Risk] Clone fails after fossil server starts**
→ Agent sends error to platform, session marked as failed. User can retry.

**[Risk] Multiple agents for same session**
→ Platform assigns `assignedAgentId` to session. Only one agent per session.

**[Risk] Agent disconnect mid-clone**
→ Fossil server continues running (30s grace period). Agent reconnects and retries.

**[Risk] ACP process crash**
→ Agent detects via process exit, reports to platform, user can restart.

**[Trade-off] Sequential vs parallel bootstrap**
→ Sequential is simpler, parallel would be faster for many sessions.
→ Accepted: Most agents have 1-2 sessions, sequential is acceptable.

**[Risk] Relative path computation fails**
→ Platform must have agent's workdir stored. Agent sends workdir in initial handshake.

## Migration Plan

### Phase 1: Platform Changes
1. Update `session_ready` message in `index.tsx`
2. Remove `openFossilCheckout` from `sessions/routes.tsx`
3. Add `workdir` field to agent registration/handshake

### Phase 2: Agent Changes
1. Add `@agentclientprotocol/sdk` to package.json
2. Add `sessions` map and `SessionContext` interface
3. Implement `session_ready` handler
4. Add fossil clone logic
5. Add ACP spawn per session
6. Add file watcher per session
7. Update README with multi-session info

### Phase 3: Testing
1. Unit tests for relative path computation
2. Integration tests for agent bootstrap
3. E2E tests for multi-session scenarios
4. Test clone failures and recovery

### Rollback
- If issues arise, platform can revert to creating checkout (feature flag)
- Agent falls back to error reporting if `session_ready` missing required fields

## Open Questions

1. **Should agent send workdir in `agent_ready` message?**
   - Yes, platform needs this for relative path computation
   - Add `workdir` field to `agent_ready`

2. **What if agent's workdir doesn't include checkout path?**
   - This is a configuration error
   - Agent should report error and fail session

3. **Should platform validate workdir includes checkout?**
   - Optional validation, warn user on session assignment
   - Agent handles the error case

4. **ACP SDK vs opencode CLI?**
   - If opencode is an ACP-compatible CLI, agent spawns it directly
   - Need to confirm what ACP SDK provides vs spawning opencode directly