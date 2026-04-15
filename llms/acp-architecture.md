# ACP Architecture And Session Behavior

## Providers

### opencode
- `newSession`: supported
- `loadSession`: supported
- `unstable_closeSession`: not supported
- Session model: stateless/in-process
- Context reset: call `newSession` (old session is abandoned)

### claude-agent-acp
- `newSession`: supported
- `loadSession`: supported
- `unstable_closeSession`: supported
- Session model: stateful, dedicated Query process per session
- Context reset: `newSession` (optionally close old session first)

## Clear Session Flow

Clear session creates a fresh ACP session while preserving mimo session/chat history.
Agent creates new ACP session, updates `acpSessionId`, and platform persists/broadcasts cleared state.

## Session Parking

Idle sessions are parked to free resources.

### States
- `ACTIVE`: normal operation
- `PARKED`: ACP terminated after idle timeout
- `WAKING`: ACP respawning and prompt queue draining

### Idle Timer Reset Events
- User messages
- ACP thought events
- ACP message chunks
- ACP usage updates

### Config
- API: `PATCH /sessions/:id/config`
- Field: `idleTimeoutMs`
- Minimum: `10000`
- `0` disables timeout
- Default: `600000` (10 minutes)

### Resume Behavior
1. Move to `WAKING`
2. Spawn ACP process
3. Attempt `loadSession(acpSessionId)`
4. Restore model/mode
5. Drain queued prompts
6. Move to `ACTIVE`

If load fails: fallback to `newSession`, keep chat history, show fresh-context notice.

## Auto-Commit On Thought End

- Auto-sync triggers on `thought_end`
- Commit message format: `[SessionName] - X files changed (+Y/-Z lines)`
- No changes -> skip commit
- Status API: `GET /sessions/:sessionId/sync-status`
- Retry API: `POST /sessions/:sessionId/sync`

## Duplication Detection

- Impact Buffer shows duplication via `jscpd`
- Runs against changed files only
- Thresholds in `AutoCommitService`:
  - Warning default: 15% (annotates commit)
  - Block default: 30% (blocks commit)

Key files:
- `packages/mimo-platform/src/impact/jscpd-service.ts`
- `packages/mimo-platform/src/impact/calculator.ts`
- `packages/mimo-platform/src/components/ImpactBuffer.tsx`
- `packages/mimo-platform/src/auto-commit/service.ts`
