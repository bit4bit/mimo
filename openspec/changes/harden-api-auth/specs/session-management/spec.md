## ADDED Requirements

### Requirement: WebSocket chat connection requires authenticated session ownership
The platform SHALL verify that a WebSocket upgrade request to `/ws/chat/:sessionId` carries a valid JWT cookie and that the authenticated user owns the requested session. Connections that fail either check SHALL be rejected before the upgrade completes.

#### Scenario: Unauthenticated WebSocket chat connection rejected
- **WHEN** a client attempts to upgrade to `/ws/chat/session-123` without a `token` cookie
- **THEN** the server responds with HTTP 401 and does not upgrade the connection

#### Scenario: Authenticated but non-owner WebSocket chat connection rejected
- **WHEN** a client with a valid JWT for user "alice" attempts to upgrade to `/ws/chat/session-123` which is owned by "bob"
- **THEN** the server responds with HTTP 401 and does not upgrade the connection

#### Scenario: Authenticated owner WebSocket chat connection accepted
- **WHEN** a client with a valid JWT for user "alice" attempts to upgrade to `/ws/chat/session-123` which is owned by "alice"
- **THEN** the server upgrades the connection and the client receives the session chat stream
