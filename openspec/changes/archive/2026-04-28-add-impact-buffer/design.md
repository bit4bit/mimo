## Context

The current SessionDetailPage shows three buffers: Files (left), Chat (center), and Changes (right). The Changes buffer only lists modified files without providing insight into the scope, complexity, or velocity of work. Users need to understand not just WHAT changed, but HOW MUCH changed, HOW COMPLEX it is, and at what VELOCITY.

The system already has:
- FileSyncService that tracks file changes between upstream/ and agent-workspace/
- Fossil integration for VCS operations
- Session infrastructure with chat and agent management

## Goals / Non-Goals

**Goals:**
- Replace the passive Changes buffer with an active Impact buffer
- Show real-time file count metrics (new/changed/deleted) with trend indicators
- Track lines of code (added/removed/net) changes
- Integrate scc for code complexity analysis (cyclomatic, cognitive, estimated time)
- Display language-specific breakdowns of metrics
- Provide per-file complexity detail (expandable)
- Auto-install scc dependency
- Persist impact metrics on commit to `~/.mimo/projects/{project-id}/impacts/`
- Create impact history page for project-wide view
- Maintain 5-second polling for real-time updates

**Non-Goals:**
- Historical trending graphs (sparklines over time)
- Diff viewer integration (only link to fossil)
- Git complexity support (scc handles both)
- Configurable polling intervals
- Impact export/download functionality

## Decisions

### Decision: Two-buffer layout (Chat + Impact)
**Rationale**: The Files buffer was redundant - users can explore files via the file tree dialog. The Impact buffer provides actionable intelligence that Changes never could.

**Alternatives considered**:
- Keep 3 buffers (Files, Chat, Impact) - rejected: too crowded
- Replace Files instead of Changes - rejected: Impact relates to Changes, not file browsing

### Decision: Auto-install scc to ~/.mimo/bin/scc
**Rationale**: scc is a compiled Go binary. Rather than requiring manual installation or Docker, we download the appropriate binary for the platform on first use.

**Download source**: GitHub releases (https://github.com/boyter/scc/releases)
**Platform detection**: Runtime detection of OS/arch

### Decision: In-memory trend tracking
**Rationale**: Trend arrows (↑ ↓ →) compare current scan vs previous scan in memory. No persistence needed - trends are ephemeral indicators of velocity.

**Trade-off**: Trends reset on server restart, but this is acceptable for velocity indicators.

### Decision: Impact record stored on commit, not continuously
**Rationale**: Only the commit matters for history. Continuous snapshotting would create noise.

**Storage path**: `~/.mimo/projects/{project-id}/impacts/{sessionId-commitHash}.yaml`

### Decision: Composite key for impact records
**Rationale**: `sessionId-commitHash` ensures uniqueness while maintaining session correlation. Session can be deleted but impact record survives.

### Decision: scc 5-second cache per session
**Rationale**: Running scc is expensive (disk I/O). Cache results for 5 seconds to avoid hammering the filesystem while maintaining near-real-time feel.

### Decision: Show "scc not installed" warning with install button
**Rationale**: If auto-install fails (network, permissions), user can manually trigger. Fallback to file counts only.

## Risks / Trade-offs

**[Risk]** scc binary download fails or is blocked by corporate proxy
→ **Mitigation**: Clear error message with manual download instructions; fallback to file-only metrics

**[Risk]** scc scanning large repositories causes performance issues
→ **Mitigation**: 5-second cache reduces scan frequency; consider adding scan timeout (30s)

**[Risk]** Impact history YAML files accumulate over time
→ **Mitigation**: YAML is compact; can implement cleanup/archive later if needed

**[Risk]** Complexity metrics confuse non-technical users
→ **Mitigation**: Make per-file detail collapsed by default; show tooltips explaining metrics

**[Trade-off]** Denormalized sessionName in impact records
We store sessionName at commit time so history shows meaningful names even if session deleted. This creates minor data duplication but improves UX significantly.

## Migration Plan

**No breaking changes** - this is purely additive:
1. Deploy new services (SccService, ImpactCalculator, ImpactRepository)
2. Deploy modified SessionDetailPage (2-buffer layout)
3. Existing sessions continue working; Impact buffer shows on next load
4. scc auto-installs on first metrics request

**Rollback**: Revert to previous commit; Impact buffer disappears, Changes buffer returns

## Open Questions

1. Should we set a maximum scan timeout for scc on very large repos?
2. Should complexity trends show "+18" or "+18 from +12" (previous absolute)?
3. Do we need a "Clear History" button on the impact history page?
