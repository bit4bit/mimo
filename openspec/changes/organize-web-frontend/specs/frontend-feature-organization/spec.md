## ADDED Requirements

### Requirement: Feature-based folder structure
The web frontend SHALL be organized into feature folders under `web/features/`. Each major domain SHALL have its own folder containing domain-specific pages and components.

#### Scenario: Sessions feature location
- **WHEN** a developer looks for sessions-related frontend code
- **THEN** they SHALL find it under `web/features/sessions/`

#### Scenario: Projects feature location
- **WHEN** a developer looks for projects-related frontend code
- **THEN** they SHALL find it under `web/features/projects/`

### Requirement: Feature folder internal structure
Each feature folder SHALL contain a `pages/` subdirectory for route handlers and a `components/` subdirectory for feature-specific UI components.

#### Scenario: Sessions pages location
- **WHEN** a developer looks for the sessions page routes
- **THEN** they SHALL find them at `web/features/sessions/pages/`

#### Scenario: Sessions components location
- **WHEN** a developer looks for the SessionDetailPage component
- **THEN** they SHALL find it at `web/features/sessions/components/SessionDetailPage.tsx`

### Requirement: Shared components extraction
Components used by two or more features SHALL reside in `web/shared/components/`. No shared components SHALL remain inside feature folders.

#### Scenario: Layout component location
- **WHEN** a developer looks for the Layout component
- **THEN** they SHALL find it at `web/shared/components/Layout.tsx`

#### Scenario: Dialog components location
- **WHEN** a developer looks for the FileFinderDialog component
- **THEN** they SHALL find it at `web/shared/components/FileFinderDialog.tsx`

### Requirement: No JSX in domain layer
The `domain/` layer SHALL NOT contain any TSX/JSX files. All UI components, including buffer components, SHALL reside in the `web/` layer.

#### Scenario: Buffer components location
- **WHEN** a developer looks for the ChatBuffer component
- **THEN** they SHALL find it under `web/` and NOT under `domain/`

#### Scenario: Domain layer purity
- **WHEN** inspecting any file under `domain/`
- **THEN** it SHALL NOT contain JSX syntax or import from `hono/jsx`

### Requirement: Import path updates
All import statements referencing moved files SHALL be updated to reflect the new paths. No broken imports SHALL remain after the reorganization.

#### Scenario: Import from feature component
- **WHEN** a page imports a feature-specific component
- **THEN** the import path SHALL reference `../components/` or `../../features/<domain>/components/`

#### Scenario: Import from shared component
- **WHEN** any file imports a shared component
- **THEN** the import path SHALL reference `../../shared/components/` or `../shared/components/`
