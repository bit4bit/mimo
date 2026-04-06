## ADDED Requirements

### Requirement: Project stores default local development mirror path
The system SHALL allow projects to define a default local development mirror path that sessions inherit.

#### Scenario: Project created with default mirror path
- **WHEN** user creates project "my-app" with defaultLocalDevMirrorPath "/home/user/projects/my-app"
- **THEN** system stores defaultLocalDevMirrorPath in project.yaml
- **AND** value persists with project configuration

#### Scenario: Project created without mirror path
- **WHEN** user creates project without specifying defaultLocalDevMirrorPath
- **THEN** project.yaml does NOT include defaultLocalDevMirrorPath field
- **AND** sessions for this project have no default mirror path

#### Scenario: Project updated with mirror path
- **WHEN** user edits project and sets defaultLocalDevMirrorPath "/home/user/new-path"
- **THEN** system updates project.yaml with new value
- **AND** existing sessions retain their current localDevMirrorPath

#### Scenario: Project clears default mirror path
- **WHEN** user edits project and clears defaultLocalDevMirrorPath
- **THEN** system removes field from project.yaml
- **AND** new sessions have no default mirror path pre-filled

### Requirement: Session stores local development mirror path
The system SHALL allow sessions to define a local development mirror path, overriding the project default.

#### Scenario: Session created with inherited mirror path
- **WHEN** user creates session for project with defaultLocalDevMirrorPath "/home/user/project"
- **THEN** session form pre-fills localDevMirrorPath with "/home/user/project"
- **AND** user accepts pre-filled value
- **THEN** system stores localDevMirrorPath in session.yaml

#### Scenario: Session created with custom mirror path
- **WHEN** user creates session for project with defaultLocalDevMirrorPath "/home/user/project"
- **THEN** session form pre-fills with project default
- **AND** user changes localDevMirrorPath to "/home/user/custom"
- **THEN** system stores custom path in session.yaml

#### Scenario: Session created with no mirror path
- **WHEN** user creates session and clears localDevMirrorPath field
- **THEN** system stores null or empty value in session.yaml
- **AND** no file sync occurs for this session

#### Scenario: Session updated with mirror path
- **WHEN** user edits existing session and sets localDevMirrorPath
- **THEN** system updates session.yaml
- **AND** agent receives updated path on next reconnection

### Requirement: Agent syncs file changes to local development mirror
The system SHALL sync all file changes from agent checkout to the local development mirror path immediately.

#### Scenario: New file created in checkout triggers mirror sync
- **WHEN** agent creates file "src/utils.ts" in checkout
- **AND** file watcher detects the change
- **AND** session has localDevMirrorPath "/home/user/dev"
- **THEN** agent creates "/home/user/dev/src/utils.ts" with same content

#### Scenario: Modified file triggers mirror sync
- **WHEN** agent modifies "src/app.ts" in checkout
- **AND** file watcher detects the change
- **AND** session has localDevMirrorPath "/home/user/dev"
- **THEN** agent overwrites "/home/user/dev/src/app.ts" with new content

#### Scenario: Deleted file triggers mirror deletion
- **WHEN** agent deletes "old-file.ts" from checkout
- **AND** file watcher detects the deletion
- **AND** session has localDevMirrorPath "/home/user/dev"
- **THEN** agent deletes "/home/user/dev/old-file.ts"

#### Scenario: VCS directories excluded from sync
- **WHEN** agent modifies ".git/config" or ".fossil" in checkout
- **AND** file watcher detects the change
- **AND** session has localDevMirrorPath "/home/user/dev"
- **THEN** agent does NOT sync these files to mirror
- **AND** mirror's ".git" directory remains unchanged

#### Scenario: Mirror sync batched with file_changed message
- **WHEN** agent creates 5 files rapidly in checkout
- **THEN** file watcher batches changes with 500ms debounce
- **AND** after debounce, agent sends single file_changed message to platform
- **AND** agent syncs all 5 files to mirror path

#### Scenario: Session without mirror path skips sync
- **WHEN** agent creates file in checkout
- **AND** session has no localDevMirrorPath set
- **THEN** agent sends file_changed message to platform
- **AND** agent does NOT attempt mirror sync

#### Scenario: Mirror path does not exist
- **WHEN** agent creates file in checkout
- **AND** session has localDevMirrorPath "/nonexistent/path"
- **THEN** agent attempts to create parent directories
- **AND** if creation fails, agent logs warning and continues
- **AND** file_changed message still sent to platform

#### Scenario: Mirror path permission denied
- **WHEN** agent attempts to write to mirror
- **AND** permission is denied
- **THEN** agent logs error with path and errno
- **AND** agent continues with other files and operations
- **AND** file_changed message still sent to platform

### Requirement: WebSocket session_ready includes mirror path
The system SHALL include localDevMirrorPath in the session_ready message sent to agents.

#### Scenario: session_ready includes mirror path
- **WHEN** agent connects and receives session_ready
- **AND** session has localDevMirrorPath "/home/user/dev"
- **THEN** message includes localDevMirrorPath field with value "/home/user/dev"

#### Scenario: session_ready without mirror path
- **WHEN** agent connects and receives session_ready
- **AND** session has no localDevMirrorPath
- **THEN** message includes localDevMirrorPath as null or omits field
- **AND** agent handles null/undefined gracefully
