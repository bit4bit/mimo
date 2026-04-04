# Design: fix-commit-flow

## Context

### Current State

The session directory structure is:
```
sessions/<session-id>/
├── session.yaml
├── repo.fossil           # Fossil proxy for agent sync
├── upstream/             # Original repository (git/fossil)
└── checkout/             # Currently: plain files, confusingly named
```

The current commit implementation in `commits/service.ts`:
1. Calls `vcs.commit(checkoutPath, message)` - **FAILS** because checkout/ has no repository
2. Calls `vcs.sync(checkoutPath, "push")` - **FAILS** because there's no repo to push from

The agent workflow is:
1. Agent clones from `repo.fossil` to its local workdir
2. Agent makes edits and continuously commits/pushes to `repo.fossil`
3. Platform should sync from `repo.fossil` → `checkout/` → `upstream/` → remote

### Problem

1. **Naming confusion**: `checkout/` is not a repository checkout - it's just a working directory
2. **Broken commit flow**: Platform tries to commit in a directory with no repository
3. **Missing sync**: Agent pushes to fossil, but platform never syncs those changes
4. **No upstream sync**: Changes never reach the original repository

### Constraints

- `repo.fossil` is the sync point between agent and platform
- `upstream/` contains the original repository where commits must be made
- Agent workspace (`checkout/`) is plain files, not a repository
- Must support both Git and Fossil upstream repositories
- Commit message format: "Mimo commit at <ISO datetime>"

## Goals / Non-Goals

**Goals:**
- Rename `checkout/` to `agent-workspace/` for clarity
- Implement correct commit flow: fossil sync → copy → upstream commit → push
- Support both Git and Fossil upstream repositories
- Clean slate copy from agent-workspace to upstream
- Handle errors gracefully with user-friendly messages

**Non-Goals:**
- Real-time bidirectional sync (out of scope)
- Conflict resolution UI (just fail and show message)
- Partial file commits (always commit all changes)
- Custom commit messages (use timestamp format)

## Decisions

### 1. Directory Rename Strategy

**Decision:** Rename `checkoutPath` to `agentWorkspacePath` throughout codebase

**Rationale:**
- "checkout" implies a repository checkout, but this is just a working directory
- "agent-workspace" clearly indicates it's for agent file operations
- Aligns with the actual usage pattern

**Implementation:**
- Update `sessions/repository.ts`: `getCheckoutPath()` → `getAgentWorkspacePath()`
- Update Session interface: `checkoutPath: string` → `agentWorkspacePath: string`
- Update SessionData YAML structure
- Update all references in routes and services

**Alternative:** Keep existing name
- **Rejected:** The name is actively misleading about the architecture

### 2. Commit Flow Architecture

**Decision:** Four-step commit process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              COMMIT FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Commit"
        │
        ▼
┌─────────────────────────────┐
│ STEP 1: fossil up            │  Sync agent-workspace with repo.fossil
│ Directory: agent-workspace/  │  (get agent's latest commits)
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ STEP 2: Clean Copy           │  Delete upstream/ contents (except VCS dir)
│ Source: agent-workspace/     │  Copy agent-workspace/ → upstream/
│ Target: upstream/            │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ STEP 3: Commit               │  Git: git add -A && git commit
│ Directory: upstream/         │  Fossil: fossil addremove && fossil commit
│ Message: "Mimo commit at..." │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ STEP 4: Push                 │  Git: git push origin <branch>
│ Directory: upstream/         │  Fossil: fossil push
│ Target: remote origin        │
└─────────────────────────────┘
```

**Rationale:**
- Agent continuously pushes to fossil, so we must sync first
- Clean slate ensures no stale files in upstream
- Commit in upstream is where the original repository lives
- Push sends to the user's remote repository

**Commit Message Format:**
```typescript
const message = `Mimo commit at ${new Date().toISOString()}`;
// Example: "Mimo commit at 2026-04-05T14:30:00.000Z"
```

### 3. VCS Method Design

**Decision:** Add four new methods to `vcs/index.ts`

```typescript
// Sync agent-workspace with repo.fossil
async fossilUp(agentWorkspacePath: string): Promise<VCSResult>

// Copy files from agent-workspace to upstream (clean slate)
async cleanCopyToUpstream(
  agentWorkspacePath: string, 
  upstreamPath: string
): Promise<VCSResult>

// Commit in upstream with timestamp message
async commitUpstream(
  upstreamPath: string, 
  repoType: "git" | "fossil"
): Promise<VCSResult>

// Push upstream to remote
async pushUpstream(
  upstreamPath: string, 
  repoType: "git" | "fossil",
  branch?: string
): Promise<VCSResult>
```

**Rationale:**
- Each step is independent and testable
- Separates concerns: sync, copy, commit, push
- Allows specific error handling per step

**Clean Slate Copy Details:**

Preserve in upstream/:
- `.git/` directory (for Git repos)
- `.fossil` file (for Fossil repos)

Delete from upstream/:
- All other files and directories

Copy from agent-workspace/:
- All files and directories
- Exclude: `.fossil` file (agent's fossil DB)
- Exclude: `.fslckout/` directory

### 4. Error Handling Strategy

**Decision:** Fail fast with clear error messages

| Step | Error | Behavior |
|------|-------|----------|
| fossil up | Sync fails | Return error: "Failed to sync with agent" |
| Clean copy | Copy fails | Return error: "Failed to copy files" |
| Commit | No changes | Return: "No changes to commit" |
| Commit | Commit fails | Return error: "Failed to commit" |
| Push | Push rejected | Return error: "Push failed" (show git/fossil output) |
| Push | Network error | Return error: "Network error during push" |

**Rationale:**
- Simple failure model - no retry logic
- Each step validates before proceeding
- User sees exactly what went wrong

### 5. Session Data Migration

**Decision:** Rename field in session.yaml

From:
```yaml
checkoutPath: /path/to/checkout
```

To:
```yaml
agentWorkspacePath: /path/to/agent-workspace
```

**Rationale:**
- Breaking change but necessary for clarity
- Existing sessions will need to be recreated or migrated

## Risks / Trade-offs

**[Risk] Breaking change for existing sessions**
→ Sessions created before this change have `checkoutPath` in their YAML
→ Mitigation: Accept that old sessions need recreation; document this

**[Risk] Clean slate copy removes upstream history**
→ We're replacing files, not merging
→ Mitigation: This is intentional - the commit in upstream captures the state

**[Risk] Fossil sync fails if repo.fossil is corrupted**
→ Agent's continuous commits could corrupt the fossil DB
→ Mitigation: Return clear error and let user recreate session

**[Risk] Push fails if remote has diverged**
→ We're not pulling before pushing
→ Mitigation: Per requirement, just fail and show message

**[Trade-off] All-or-nothing commits**
→ Cannot commit subset of files
→ Accepted: Simpler UX, matches the "clean slate" approach

**[Trade-off] Timestamp commit messages only**
→ Users cannot customize commit message
→ Accepted: Simpler implementation, consistent format

## Migration Plan

### Phase 1: Code Changes
1. Update `sessions/repository.ts` with renamed methods and field
2. Update `sessions/routes.tsx` with new path references
3. Update `sync/service.ts` with renamed paths
4. Rewrite `commits/service.ts` with new flow
5. Add new methods to `vcs/index.ts`
6. Update all tests

### Phase 2: Session Recreation
- Old sessions with `checkoutPath` won't work
- Users need to create new sessions
- Document this as a breaking change

### Rollback
- If issues arise, can revert to previous commit
- Old code still exists in git history

## Open Questions

None - all decisions made during exploration phase.
