## ADDED Requirements

### Requirement: User can register with username and password
The system SHALL allow users to register with a username and password combination without email confirmation.

#### Scenario: Successful registration
- **WHEN** user submits username "alice" and password "secret123"
- **THEN** system creates user directory at ~/.mimo/users/alice/
- **AND** system stores BCrypt hash in ~/.mimo/users/alice/credentials.yaml
- **AND** system returns success message

#### Scenario: Duplicate username
- **WHEN** user submits username "alice" that already exists
- **THEN** system returns error "Username already exists"
- **AND** no new user directory is created

### Requirement: User can login with credentials
The system SHALL authenticate users against stored BCrypt hashes.

#### Scenario: Successful login
- **WHEN** user submits username "alice" and password "secret123"
- **AND** credentials match stored hash
- **THEN** system creates session cookie with JWT token
- **AND** system redirects to projects page

#### Scenario: Invalid password
- **WHEN** user submits username "alice" and incorrect password
- **THEN** system returns error "Invalid credentials"
- **AND** no session is created

#### Scenario: Non-existent user
- **WHEN** user submits username "bob" that does not exist
- **THEN** system returns error "Invalid credentials"
- **AND** no session is created

### Requirement: User can logout
The system SHALL allow authenticated users to terminate their session.

#### Scenario: Successful logout
- **WHEN** authenticated user clicks logout
- **THEN** system clears session cookie
- **AND** system redirects to login page

### Requirement: User authentication persists via JWT
The system SHALL use JWT tokens for maintaining authentication state.

#### Scenario: Token validation
- **WHEN** user makes request with valid JWT token
- **THEN** system allows access to protected resources

#### Scenario: Token expiration
- **WHEN** user makes request with expired JWT token
- **THEN** system redirects to login page
