## MODIFIED Requirements

### Requirement: Project-level VCS cache provides fast repository cloning

The system SHALL maintain a cache for each project repository that enables fast cloning for session creation.

#### Scenario: Git project repository cache enables fast session creation

- **WHEN** a new session is created for a Git project repository
- **THEN** the system SHALL clone that repository from its project repository cache rather than the remote
- **AND** the clone SHALL complete in under 10 seconds for a 1GB repository

#### Scenario: Fossil project repository cache enables fast session creation

- **WHEN** a new session is created for a Fossil project repository
- **THEN** the system SHALL open that repository from its project repository cache rather than cloning from remote
- **AND** the cache open SHALL complete in under 5 seconds

### Requirement: Cache freshness via eager fetch

The system SHALL refresh each project repository cache on every session creation to ensure it contains the latest remote changes.

#### Scenario: Git cache refresh on session creation

- **WHEN** a session is created for a Git project repository with an existing cache
- **THEN** the system SHALL execute `git fetch --all` on that repository cache before cloning
- **AND** the session SHALL be created from the updated cache

#### Scenario: Fossil cache refresh on session creation

- **WHEN** a session is created for a Fossil project repository with an existing cache
- **THEN** the system SHALL execute `fossil sync` on that repository cache before opening
- **AND** the session SHALL be created from the updated cache

### Requirement: Cache cleanup on project deletion

The system SHALL remove all project repository caches when a project is deleted.

#### Scenario: Multi-repository cache cleanup

- **WHEN** a project with multiple repositories is deleted
- **THEN** the system SHALL remove the cache storage for every project repository
