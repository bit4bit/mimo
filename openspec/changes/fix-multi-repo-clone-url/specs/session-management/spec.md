## ADDED Requirements

### Requirement: Each session repository gets its own bare repo and clone URL

The system SHALL seed one bare session repository per session repository, stored as `<sid>-<repoId>.git`, and serve it at the per-repo URL `/<sid>/<repoId>.git/`. The system SHALL NOT rely on a single per-session bare repo (`<sid>.git`) for sessions whose repositories are keyed by `repoId`. Credentials SHALL be enforced per session repository via the same basic-auth model used for the session.

#### Scenario: Multi-repo session seeds per-repo bare repos

- **WHEN** a session is created for a project with repositories "backend" and "frontend"
- **THEN** the system seeds bare repos `<sid>-backend.git` and `<sid>-frontend.git` on disk
- **AND** each is reachable at `/<sid>/<repoId>.git/` over git smart-HTTP
- **AND** no `<sid>.git` bare repo is created

#### Scenario: Per-repo URL is resolvable

- **WHEN** a git client requests `/<sid>/<repoId>.git/info/refs`
- **THEN** the git HTTP server resolves the request to the `<sid>-<repoId>.git` bare repo on disk
- **AND** the request succeeds after credential verification for the session