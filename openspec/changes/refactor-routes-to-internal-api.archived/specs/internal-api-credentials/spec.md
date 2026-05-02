## ADDED Requirements

### Requirement: List credentials endpoint
The system SHALL provide an internal API endpoint that returns all credentials for the authenticated user.

#### Scenario: User requests credentials list
- **WHEN** an authenticated GET request is made to `/api/internal/credentials`
- **THEN** the system SHALL return all credentials owned by the user
- **AND** include id, name, type, and metadata (excluding secrets)

### Requirement: Get credential endpoint
The system SHALL provide an internal API endpoint that returns a specific credential by ID.

#### Scenario: User requests specific credential
- **WHEN** an authenticated GET request is made to `/api/internal/credentials/:id`
- **THEN** the system SHALL return the credential with all fields

### Requirement: Create credential endpoint
The system SHALL provide an internal API endpoint that creates a new credential.

#### Scenario: User creates SSH credential
- **WHEN** an authenticated POST request is made to `/api/internal/credentials` with SSH key data
- **THEN** the system SHALL securely store the credential
- **AND** return the created credential ID

#### Scenario: User creates HTTPS credential
- **WHEN** an authenticated POST request is made to `/api/internal/credentials` with username/password
- **THEN** the system SHALL securely store the credential
- **AND** return the created credential ID

### Requirement: Update credential endpoint
The system SHALL provide an internal API endpoint that updates credential properties.

#### Scenario: User updates credential
- **WHEN** an authenticated PUT request is made to `/api/internal/credentials/:id` with update data
- **THEN** the system SHALL update the credential

### Requirement: Delete credential endpoint
The system SHALL provide an internal API endpoint that deletes a credential.

#### Scenario: User deletes credential
- **WHEN** an authenticated DELETE request is made to `/api/internal/credentials/:id`
- **THEN** the system SHALL delete the credential
- **AND** remove it from any associated projects
