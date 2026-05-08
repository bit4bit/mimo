## ADDED Requirements

### Requirement: Register user endpoint

The system SHALL provide an internal API endpoint that registers a new user.

#### Scenario: User registers successfully

- **WHEN** a POST request is made to `/api/internal/auth/register` with username and password
- **THEN** the system SHALL check username is not taken
- **AND** hash the password using bcrypt
- **AND** create the user
- **AND** return success

#### Scenario: Username already exists

- **WHEN** a POST request is made with a username that already exists
- **THEN** the system SHALL return a 409 error

#### Scenario: Missing required fields

- **WHEN** a POST request is made without username or password
- **THEN** the system SHALL return a 400 error

### Requirement: Login endpoint

The system SHALL provide an internal API endpoint that authenticates a user and returns a token.

#### Scenario: User logs in successfully

- **WHEN** a POST request is made to `/api/internal/auth/login` with valid username and password
- **THEN** the system SHALL verify the credentials
- **AND** generate a JWT token
- **AND** return the token and user info

#### Scenario: Invalid credentials

- **WHEN** a POST request is made with invalid username or password
- **THEN** the system SHALL return a 401 error

### Requirement: Logout endpoint

The system SHALL provide an internal API endpoint that handles logout.

#### Scenario: User logs out

- **WHEN** an authenticated POST request is made to `/api/internal/auth/logout`
- **THEN** the system SHALL invalidate the token
- **AND** return success

### Requirement: Verify token endpoint

The system SHALL provide an internal API endpoint that verifies a token is valid.

#### Scenario: Token verification

- **WHEN** a GET request is made to `/api/internal/auth/verify` with a token
- **THEN** the system SHALL validate the token
- **AND** return the decoded user info if valid
- **AND** return 401 if invalid
