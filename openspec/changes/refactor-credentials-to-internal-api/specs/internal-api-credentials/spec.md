## ADDED Requirements

### Requirement: List credentials endpoint

The system SHALL provide an internal API endpoint that returns all credentials for the authenticated user without secrets.

#### Scenario: User requests credentials list

- **WHEN** an authenticated GET request is made to `/api/internal/credentials`
- **THEN** the system SHALL return all credentials owned by the user
- **AND** the response SHALL include id, name, type, and metadata
- **AND** the response SHALL NOT include password or privateKey fields

### Requirement: Get credential endpoint

The system SHALL provide an internal API endpoint that returns a specific credential including secrets for editing.

#### Scenario: User requests specific credential

- **WHEN** an authenticated GET request is made to `/api/internal/credentials/:id`
- **THEN** the system SHALL return the credential with the matching ID
- **AND** the response SHALL include all fields including secrets

#### Scenario: User requests non-existent credential

- **WHEN** an authenticated GET request is made to `/api/internal/credentials/:id` for a non-existent credential
- **THEN** the system SHALL return a 404 error

### Requirement: Create HTTPS credential endpoint

The system SHALL provide an internal API endpoint that creates an HTTPS credential.

#### Scenario: User creates valid HTTPS credential

- **WHEN** an authenticated POST request is made to `/api/internal/credentials` with type="https", name, username, and password
- **THEN** the system SHALL securely store the credential
- **AND** return the created credential without the password

#### Scenario: User creates HTTPS credential with missing fields

- **WHEN** an authenticated POST request is made with type="https" but missing username or password
- **THEN** the system SHALL return a 400 error with validation message

### Requirement: Create SSH credential endpoint

The system SHALL provide an internal API endpoint that creates an SSH credential.

#### Scenario: User creates valid SSH credential

- **WHEN** an authenticated POST request is made to `/api/internal/credentials` with type="ssh", name, and privateKey
- **THEN** the system SHALL securely store the credential
- **AND** return the created credential without the private key

#### Scenario: User creates SSH credential with missing fields

- **WHEN** an authenticated POST request is made with type="ssh" but missing privateKey
- **THEN** the system SHALL return a 400 error with validation message

### Requirement: Update credential endpoint

The system SHALL provide an internal API endpoint that updates credential properties.

#### Scenario: User updates HTTPS credential

- **WHEN** an authenticated PUT request is made to `/api/internal/credentials/:id` with name, username, or password
- **THEN** the system SHALL update the credential
- **AND** return the updated credential

#### Scenario: User updates SSH credential

- **WHEN** an authenticated PUT request is made to `/api/internal/credentials/:id` with name or privateKey
- **THEN** the system SHALL update the credential
- **AND** return the updated credential

#### Scenario: User updates non-existent credential

- **WHEN** an authenticated PUT request is made to `/api/internal/credentials/:id` for a non-existent credential
- **THEN** the system SHALL return a 404 error

### Requirement: Delete credential endpoint

The system SHALL provide an internal API endpoint that deletes a credential.

#### Scenario: User deletes credential

- **WHEN** an authenticated DELETE request is made to `/api/internal/credentials/:id`
- **THEN** the system SHALL delete the credential
- **AND** return a success confirmation

#### Scenario: User deletes non-existent credential

- **WHEN** an authenticated DELETE request is made to `/api/internal/credentials/:id` for a non-existent credential
- **THEN** the system SHALL return a 404 error
