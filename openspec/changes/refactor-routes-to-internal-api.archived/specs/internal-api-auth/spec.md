## ADDED Requirements

### Requirement: Login endpoint
The system SHALL provide an internal API endpoint that authenticates a user and returns a JWT token.

#### Scenario: User logs in with valid credentials
- **WHEN** a POST request is made to `/api/internal/auth/login` with valid username and password
- **THEN** the system SHALL validate the credentials
- **AND** return a JWT token
- **AND** return user information

#### Scenario: User logs in with invalid credentials
- **WHEN** a POST request is made to `/api/internal/auth/login` with invalid credentials
- **THEN** the system SHALL return a 401 error
- **AND** not provide a token

### Requirement: Logout endpoint
The system SHALL provide an internal API endpoint that handles user logout.

#### Scenario: User logs out
- **WHEN** an authenticated POST request is made to `/api/internal/auth/logout`
- **THEN** the system SHALL invalidate the session/token
- **AND** return a success confirmation

### Requirement: Verify token endpoint
The system SHALL provide an internal API endpoint that verifies a JWT token is valid.

#### Scenario: Token verification request
- **WHEN** a GET request is made to `/api/internal/auth/verify` with a token in the Authorization header
- **THEN** the system SHALL validate the token
- **AND** return the decoded user information if valid
- **AND** return 401 if invalid or expired
