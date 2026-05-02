## ADDED Requirements

### Requirement: Internal API Client Abstraction
The system SHALL provide a shared `createInternalApiClient()` function that encapsulates HTTP calls to the internal API with automatic token handling and standardized responses.

#### Scenario: Create API client
- **WHEN** a route needs to call the internal API
- **THEN** it SHALL call `createInternalApiClient(c, mimoContext)`
- **AND** receive a client object with get, post, put, delete methods

#### Scenario: GET request via client
- **WHEN** `apiClient.get('/sessions')` is called
- **THEN** it SHALL automatically extract token from cookie
- **AND** make HTTP GET to `/api/internal/sessions`
- **AND** return typed response data

#### Scenario: POST request via client
- **WHEN** `apiClient.post('/sessions', body)` is called
- **THEN** it SHALL include the body as JSON
- **AND** set Content-Type header to application/json
- **AND** return typed response data

#### Scenario: PUT request via client
- **WHEN** `apiClient.put('/sessions/123', body)` is called
- **THEN** it SHALL make HTTP PUT with body
- **AND** return typed response data

#### Scenario: DELETE request via client
- **WHEN** `apiClient.delete('/sessions/123')` is called
- **THEN** it SHALL make HTTP DELETE
- **AND** return typed response

### Requirement: Automatic Token Handling
The system SHALL automatically extract and forward JWT tokens from cookies.

#### Scenario: Missing token
- **WHEN** a request is made without a token in cookies
- **THEN** the client SHALL return `{ success: false, error: "Unauthorized", status: 401 }`
- **AND** NOT make an HTTP request

#### Scenario: Valid token
- **WHEN** a valid token is in cookies
- **THEN** the client SHALL extract it via `extractTokenFromCookie()`
- **AND** include it in the Authorization header as `Bearer ${token}`

### Requirement: Standardized Response Format
The system SHALL return a consistent response format from all client methods.

#### Scenario: Successful response
- **WHEN** internal API returns `{ success: true, data: {...} }`
- **THEN** the client SHALL return `{ success: true, data: T, status: number }`

#### Scenario: Error response
- **WHEN** internal API returns `{ success: false, error: "..." }`
- **THEN** the client SHALL return `{ success: false, error: string, status: number }`

#### Scenario: Network error
- **WHEN** fetch throws an error (network, timeout, etc.)
- **THEN** the client SHALL return `{ success: false, error: "Network error", status: 500 }`

### Requirement: Type Safety
The system SHALL support generic type parameters for response data.

#### Scenario: Typed response
- **WHEN** `apiClient.get<SessionResponse>('/sessions/123')` is called
- **THEN** the return type SHALL be `ApiResult<SessionResponse>`
- **AND** TypeScript SHALL enforce the type

### Requirement: Reduced Boilerplate
The system SHALL reduce the code required to call internal API.

#### Scenario: Code reduction
- **GIVEN** a route that needs internal API data
- **WHEN** using the client instead of manual fetch
- **THEN** the code SHALL be reduced from ~10 lines to ~3 lines
- **AND** routes SHALL be more readable and maintainable
