## ADDED Requirements

### Requirement: Project-level VCS cache provides fast repository cloning
The system SHALL maintain a project-level cache of the VCS repository that enables fast cloning for session creation.

#### Scenario: Git project cache enables fast session creation
- **WHEN** a new session is created for a Git project
- **THEN** the system SHALL clone from the project-level cache rather than the remote
- **AND** the clone SHALL complete in under 10 seconds for a 1GB repository

#### Scenario: Fossil project cache enables fast session creation
- **WHEN** a new session is created for a Fossil project
- **THEN** the system SHALL open from the project-level cache rather than cloning from remote
- **AND** the cache open SHALL complete in under 5 seconds

### Requirement: Cache freshness via eager fetch
The system SHALL refresh the project-level cache on every session creation to ensure it contains the latest remote changes.

#### Scenario: Git cache refresh on session creation
- **WHEN** a session is created for a Git project with an existing cache
- **THEN** the system SHALL execute `git fetch --all` on the cache before cloning
- **AND** the session SHALL be created from the updated cache

#### Scenario: Fossil cache refresh on session creation
- **WHEN** a session is created for a Fossil project with an existing cache
- **THEN** the system SHALL execute `fossil sync` on the cache before opening
- **AND** the session SHALL be created from the updated cache

### Requirement: Cache abstraction supports multiple VCS types
The system SHALL provide a unified interface for cache operations that works for both Git and Fossil repositories.

#### Scenario: Git cache engine implementation
- **WHEN** the cache is initialized with repoType "git"
- **THEN** the system SHALL use the Git cache engine with bare repository storage
- **AND** the cache SHALL support refresh and clone operations

#### Scenario: Fossil cache engine implementation
- **WHEN** the cache is initialized with repoType "fossil"
- **THEN** the system SHALL use the Fossil cache engine with single-file storage
- **AND** the cache SHALL support refresh and clone operations

### Requirement: Cache recovery from corruption
The system SHALL detect and recover from cache corruption automatically.

#### Scenario: Git cache corruption detection
- **WHEN** the Git cache is corrupted
- **THEN** the system SHALL detect corruption via `git fsck`
- **AND** the system SHALL clear the cache and re-clone from remote

#### Scenario: Fossil cache corruption detection
- **WHEN** the Fossil cache is corrupted
- **THEN** the system SHALL detect corruption via `fossil verify`
- **AND** the system SHALL clear the cache and re-clone from remote

### Requirement: Cache cleanup on project deletion
The system SHALL remove the project-level cache when a project is deleted.

#### Scenario: Git cache cleanup
- **WHEN** a Git project is deleted
- **THEN** the system SHALL remove the `cache.git/` directory

#### Scenario: Fossil cache cleanup
- **WHEN** a Fossil project is deleted
- **THEN** the system SHALL remove the `cache.fossil` file
