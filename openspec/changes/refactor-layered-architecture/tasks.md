# Layered Architecture Refactor - Task Index

This change reorganizes the mimo-platform codebase into a strict four-layer architecture. Tasks are organized by layer in separate files.

## Task Files

### [Infrastructure Layer](./tasks/infrastructure.md)

Server bootstrap, DI context, OS adapters. Must be completed first.

### [Domain Layer](./tasks/domain.md)

All business logic, services, repositories. **No HTTP or frontend code allowed.**

### [API Layer](./tasks/api.md)

REST controllers, WebSocket handlers, MCP endpoints. Delegates to domain layer.

### [Frontend/Web Layer](./tasks/frontend.md)

JSX page routes and shared UI components. Communicates via HTTP APIs only.

### [Root Index & Bootstrap](./tasks/index-bootstrap.md)

Simplify `index.tsx` to a thin entry point.

### [Validation & Cleanup](./tasks/validation.md)

Verify layer boundaries, run tests, cleanup empty directories.

## Execution Order

1. **Infrastructure** - Move server, context, OS (foundation layer)
2. **Domain** - Move all business logic (must be pure, no HTTP/web)
3. **API** - Move REST, WebSocket, MCP handlers (transport layer)
4. **Frontend** - Move pages and components (presentation layer)
5. **Index Bootstrap** - Refactor entry point
6. **Validation** - Verify boundaries and run tests

## Quick Stats

- **Total task files**: 6
- **Estimated stages**: 6 sequential phases
- **Key constraint**: Domain layer must never import from API, Web, or Infrastructure/Server
