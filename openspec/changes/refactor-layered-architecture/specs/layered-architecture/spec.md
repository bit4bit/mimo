## ADDED Requirements

### Requirement: Domain layer contains business logic

The domain layer SHALL contain all business logic, services, repositories, and domain-specific utilities. No HTTP handling, HTML rendering, or server infrastructure code SHALL reside in the domain layer.

#### Scenario: Domain service location

- **WHEN** a developer looks for the agents business logic
- **THEN** they SHALL find it at `domain/agents/service.ts`

#### Scenario: Domain repository location

- **WHEN** a developer looks for the sessions data access layer
- **THEN** they SHALL find it at `domain/sessions/repository.ts`

#### Scenario: No HTTP imports in domain

- **WHEN** inspecting any file under `domain/`
- **THEN** it SHALL NOT import from `api/`, `web/`, or `infrastructure/server/`

### Requirement: API layer contains transport concerns

The API layer SHALL contain all REST controllers, WebSocket handlers, MCP server endpoints, and JSON route handlers. The API layer SHALL delegate all business logic to the domain layer.

#### Scenario: REST controller location

- **WHEN** a developer looks for the projects API endpoints
- **THEN** they SHALL find them at `api/rest/projects.ts`

#### Scenario: WebSocket handler location

- **WHEN** a developer looks for agent WebSocket message handling
- **THEN** they SHALL find it at `api/websocket/agent.ts`

#### Scenario: API delegates to domain

- **WHEN** an API endpoint processes a request
- **THEN** it SHALL call domain services for business logic and SHALL NOT contain business rules inline

### Requirement: Web layer contains presentation logic

The web layer SHALL contain all HTML/JSX page routes, shared UI components, and frontend-specific utilities. The web layer SHALL interact with backend functionality exclusively through HTTP APIs.

#### Scenario: Page route location

- **WHEN** a developer looks for the dashboard page route
- **THEN** they SHALL find it at `web/pages/dashboard.tsx`

#### Scenario: Shared component location

- **WHEN** a developer looks for reusable UI components
- **THEN** they SHALL find them under `web/components/`

#### Scenario: Web layer uses APIs only

- **WHEN** inspecting any file under `web/`
- **THEN** it SHALL NOT import from `domain/` directly

### Requirement: Infrastructure layer contains system concerns

The infrastructure layer SHALL contain server bootstrap, dependency injection context, OS adapters, database connections, and other system-level utilities. The infrastructure layer SHALL NOT contain business logic or API controllers.

#### Scenario: Server bootstrap location

- **WHEN** a developer looks for the Bun server setup
- **THEN** they SHALL find it at `infrastructure/server/mimo-server.ts`

#### Scenario: DI context location

- **WHEN** a developer looks for service wiring and repositories
- **THEN** they SHALL find it at `infrastructure/context/mimo-context.ts`

#### Scenario: Infrastructure supports all layers

- **WHEN** any layer needs a system utility
- **THEN** it SHALL import from `infrastructure/` and infrastructure SHALL have no dependencies on `domain/`, `api/`, or `web/`

### Requirement: Layer dependency rules

The codebase SHALL enforce unidirectional dependencies: domain has no layer dependencies; api depends on domain and infrastructure; web depends on api (via HTTP calls) and infrastructure; infrastructure has no layer dependencies.

#### Scenario: Domain independence

- **WHEN** a file under `domain/` is compiled
- **THEN** it SHALL NOT transitively depend on `api/`, `web/`, or `infrastructure/server/`

#### Scenario: API depends on domain

- **WHEN** a file under `api/` is compiled
- **THEN** it MAY import from `domain/` and `infrastructure/`

#### Scenario: Web isolation

- **WHEN** a file under `web/` is compiled
- **THEN** it SHALL NOT transitively depend on `domain/`

### Requirement: Internal API merge

The parallel `api/internal/` directory SHALL be eliminated. Its contents SHALL be merged into `api/rest/` as domain-specific API files.

#### Scenario: No internal API directory

- **WHEN** inspecting the `api/` directory after migration
- **THEN** there SHALL NOT be an `api/internal/` subdirectory

#### Scenario: Agents API merged

- **WHEN** a developer looks for the agents internal API
- **THEN** they SHALL find it integrated into `api/rest/agents.ts`
