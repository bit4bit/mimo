## 1. Core Services

- [x] 1.1 Create SccService for scc binary management (auto-download, platform detection, execution)
- [x] 1.2 Create ImpactCalculator service to compute file/LOC/complexity deltas between directories
- [x] 1.3 Create ImpactRepository for YAML persistence (load/save impact records)

## 2. Impact Metrics API

- [x] 2.1 Add GET /sessions/:id/impact endpoint returning real-time metrics with trend data
- [x] 2.2 Add 5-second polling mechanism in SessionDetailPage client code
- [x] 2.3 Cache scc results for 5 seconds per session to avoid repeated scanning

## 3. UI Components

- [x] 3.1 Create ImpactBuffer component with file counts, LOC, and complexity sections
- [x] 3.2 Add trend indicators (↑ ↓ →) to ImpactBuffer metrics
- [x] 3.3 Add Fossil web links (Timeline, Diff, Files) to ImpactBuffer
- [x] 3.4 Add expandable per-file complexity detail view
- [x] 3.5 Add language breakdown display (TypeScript, Python, etc.)
- [x] 3.6 Add scc not installed warning with manual install button

## 4. Session Page Restructuring

- [x] 4.1 Modify SessionDetailPage to remove Changes buffer
- [x] 4.2 Modify SessionDetailPage to show 2-buffer layout (Chat center, Impact right)
- [x] 4.3 Update session routes to provide impact data to page component

## 5. Impact Persistence

- [x] 5.1 Hook into commit flow to capture metrics before push
- [x] 5.2 Save impact record to ~/.mimo/projects/{project-id}/impacts/{sessionId-commitHash}.yaml
- [x] 5.3 Include sessionName denormalization for deleted session handling

## 6. Impact History Page

- [x] 6.1 Create ImpactHistoryPage component showing project impact table
- [x] 6.2 Add GET /projects/:id/impacts route
- [x] 6.3 Add link from project detail to impact history page
- [x] 6.4 Handle session link (clickable when exists, "(deleted)" indicator when not)
- [x] 6.5 Add fossil commit hash links opening in new tab

## 7. Testing

- [x] 7.1 Test scc auto-download on fresh system
- [x] 7.2 Test impact calculation with known file changes
- [x] 7.3 Test trend indicators update correctly
- [x] 7.4 Test impact persistence on commit
- [x] 7.5 Test impact history page with deleted sessions
