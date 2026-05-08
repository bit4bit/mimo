## ADDED Requirements

### Requirement: JWT_SECRET is required at startup

The system SHALL refuse to start if `JWT_SECRET` is not set in the environment.

#### Scenario: Missing JWT_SECRET

- **WHEN** the platform starts without `JWT_SECRET` set
- **THEN** the process throws an error with message indicating `JWT_SECRET` is required
- **AND** the server does not bind to any port

#### Scenario: JWT_SECRET present

- **WHEN** the platform starts with `JWT_SECRET` set to a non-empty value
- **THEN** the server starts normally

## MODIFIED Requirements

### Requirement: User authentication persists via JWT

The system SHALL use JWT tokens for maintaining authentication state. All token signing and verification throughout the platform SHALL use the same `JwtService` instance configured with the `JWT_SECRET` environment variable.

#### Scenario: Token validation

- **WHEN** user makes request with valid JWT token
- **THEN** system allows access to protected resources

#### Scenario: Token expiration

- **WHEN** user makes request with expired JWT token
- **THEN** system redirects to login page

#### Scenario: Token signed by login is accepted by route guard

- **WHEN** a user logs in and receives a JWT token
- **AND** the user makes a request to any protected HTTP route
- **THEN** the route guard accepts the token
- **AND** the user is granted access

#### Scenario: Token signed with wrong secret is rejected

- **WHEN** a request carries a JWT token signed with a different secret
- **THEN** the route guard rejects the token
- **AND** the system redirects to login page
