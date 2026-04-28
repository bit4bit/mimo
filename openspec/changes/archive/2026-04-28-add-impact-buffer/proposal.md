## Why

The current session view shows a "Changes" buffer that simply lists modified files, but doesn't tell the story of the work being done. Users need visibility into the actual impact of their agent's work - not just what changed, but how much code was affected, how complex it is, and the velocity of changes. This insight helps users understand the scope and risk of commits before pushing.

## What Changes

- **Replace Changes buffer with Impact buffer**: Remove the passive file list from the right buffer; keep only Chat (center) and Impact (right) buffers
- **Real-time impact metrics**: Show new/changed/deleted file counts with trend indicators (↑ ↓ →)
- **Lines of Code tracking**: Display added, removed, and net LOC changes
- **Code complexity analysis**: Integrate scc (Sloc Cloc and Code) to show cyclomatic complexity, cognitive complexity, and estimated time per change
- **Language breakdown**: Show metrics grouped by programming language
- **Per-file complexity detail**: Expandable view showing individual file complexity metrics
- **Auto-install scc**: Download and install scc binary to `~/.mimo/bin/scc` automatically
- **Impact persistence**: Store impact metrics on every commit at `~/.mimo/projects/{project-id}/impacts/{sessionId-commitHash}.yaml`
- **Impact history page**: New page showing all impacts for a project with session links, commit hashes, and full metrics
- **Fossil integration**: Link to fossil web UI (timeline, diff, files) in Impact buffer
- **5-second polling**: Auto-refresh metrics in real-time as agent works

## Capabilities

### New Capabilities
- `impact-tracking`: Real-time and historical tracking of code change impact including file counts, LOC, and complexity metrics
- `scc-integration`: Automatic installation and execution of scc for code complexity analysis
- `impact-history`: Persistence and retrieval of impact records per project with session correlation

### Modified Capabilities
- `session-ui`: Modify SessionDetailPage to replace Changes buffer with Impact buffer (2-buffer layout)

## Impact

- **SessionDetailPage.tsx**: Major UI restructuring - remove Changes buffer, add Impact buffer
- **sync/service.ts**: Extend FileSyncService with impact calculation
- **New services**: scc service, impact calculator, impact repository
- **New routes**: Impact metrics API endpoint, impact history page
- **New components**: ImpactBuffer component, ImpactHistoryPage component
- **Dependencies**: scc binary (auto-downloaded), fossil web server (existing)
