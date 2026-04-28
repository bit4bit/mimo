## Context

Currently, mimo-agent watches the checkout directory for file changes and sends `file_changed` messages to mimo-platform for tracking. Users can only test agent changes by committing and pushing to their upstream repository. This creates a slow feedback loop - write code, commit, push, pull, test.

The Local Development Mirror feature adds a second sync destination: a user-specified local directory where changes appear immediately. This allows users to see agent modifications in real-time in their IDE and run tests without the commit cycle.

**Current Flow:**
```
Agent checkout/ ──► file_changed (WS) ──► Platform upstream/
```

**New Flow:**
```
Agent checkout/ ──► file_changed (WS) ──► Platform upstream/
              └─► immediate sync ─────► Local Dev Mirror
```

## Goals / Non-Goals

**Goals:**
- Enable immediate sync of agent workspace changes to a local development directory
- Provide project-level default with per-session override capability
- Support immediate file sync (no delay) for real-time feedback
- Preserve user experience: agent changes appear instantly in user's IDE

**Non-Goals:**
- Bidirectional sync (platform → agent, not mirror → agent)
- VCS operations in mirror (user manages their own .git)
- Conflict resolution UI (agent wins, simple overwrite)
- Remote directories (local filesystem only)

## Decisions

### Decision 1: Project Default + Session Override
**Choice:** Store `defaultLocalDevMirrorPath` on Project, `localDevMirrorPath` on Session. Session creation form pre-fills from project, user can modify.

**Rationale:**
- Most users work on one project = one local directory
- Per-session flexibility for different feature branches or testing scenarios
- Pre-fill reduces repetitive entry
- Empty value = disabled (opt-out per session)

**Alternative considered:** Session-only (rejected): Would require users to enter path for every session, repetitive for single-project workflows.

### Decision 2: Agent Wins, Immediate Sync
**Choice:** When file changes, agent immediately syncs to mirror path. If file exists in mirror, overwrite it. No conflict detection.

**Rationale:**
- Simple mental model: agent owns the checkout, mirror reflects it
- Immediate sync means real-time IDE updates
- User can use their IDE's undo if needed
- Avoids complexity of merge/conflict UIs

**Alternative considered:** Skip if modified (rejected): Would require tracking mirror state, complex and surprising for users.

### Decision 3: Exclude VCS Directories
**Choice:** Never sync `.git/`, `.fossil/` directories from checkout to mirror.

**Rationale:**
- Mirror is user's working directory with their own VCS state
- Syncing VCS metadata would corrupt user's repository
- File-level sync only, preserve mirror's VCS integrity

### Decision 4: Sync in File Watcher
**Choice:** Extend existing file watcher in `SessionManager` to copy files to mirror path alongside existing `onFileChange` callback.

**Rationale:**
- Reuses existing infrastructure (debounced watcher, change batching)
- Minimal code change - add sync alongside existing behavior
- Same timing characteristics as current file change detection

### Decision 5: Mirror Path Validation (Deferred)
**Choice:** Do not validate mirror path at session creation time.

**Rationale:**
- Path may not exist yet (user creates it later)
- Agent handles missing path gracefully (logs warning, continues)
- Avoids blocking session creation for transient filesystem issues

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent overwrites user's uncommitted work | Medium | High | Document "agent wins" behavior; users should commit before active agent sessions |
| Mirror path doesn't exist or is inaccessible | Low | Low | Agent logs warning, continues normal operation; no sync attempted |
| Permission denied on mirror write | Low | Medium | Agent logs error, continues; user can fix permissions |
| Performance impact on many file changes | Low | Medium | Same batching as current file watcher; sync happens once per batch |
| Accidental sync to wrong directory | Low | High | Path input validated as absolute path; confirmation on form submission |

**Trade-offs:**
- Agent wins = potential data loss for uncommitted user changes in mirror
- Immediate sync = more file operations, but acceptable for development workflow
- No VCS sync = user must manually commit in mirror, but preserves their workflow

## Migration Plan

**Deployment:**
1. Deploy mimo-platform with new fields (backward compatible - new fields optional)
2. Deploy mimo-agent with sync logic (backward compatible - no mirror = no sync)

**Rollback:**
- Revert to previous versions; new YAML fields will be ignored
- No data migration needed

**Existing Sessions:**
- Sessions without `localDevMirrorPath` behave exactly as before
- Field can be added to existing sessions via edit form (if we add one) or only on new sessions

## Open Questions

None - design is ready for implementation.
