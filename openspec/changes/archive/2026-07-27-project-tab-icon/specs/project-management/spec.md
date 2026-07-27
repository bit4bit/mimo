## MODIFIED Requirements

### Requirement: User can create a project

The system SHALL allow authenticated users to create projects that can be linked to Git or Fossil repositories. The project model SHALL accept optional `color` (a CSS color string) and `iconGlyph` (a single character) override fields, which, when present, override the derived favicon color and glyph respectively. When these fields are absent, the system SHALL derive the favicon from the project `id` and `name` as specified in the `project-tab-icon` capability.

#### Scenario: Create project with Git repository

- **WHEN** authenticated user submits project name "my-app" and Git URL "https://github.com/user/repo.git"
- **THEN** system creates directory ~/.mimo/projects/my-app/
- **AND** system stores project.yaml with {name: "my-app", repos: [{type: "git", url: "..."}]}
- **AND** system redirects to session creation

#### Scenario: Create project with Fossil repository

- **WHEN** authenticated user submits project name "my-app" and Fossil URL "https://fossil.example.com/repo"
- **THEN** system creates directory ~/.mimo/projects/my-app/
- **AND** system stores project.yaml with {name: "my-app", repos: [{type: "fossil", url: "..."}]}

#### Scenario: Create project with multiple repositories

- **WHEN** authenticated user submits project name "my-app" with two repository URLs
- **THEN** system stores both repositories in project.yaml repos array

#### Scenario: Duplicate project name

- **WHEN** user submits project name that already exists
- **THEN** system returns error "Project name already exists"

#### Scenario: Create project without color or iconGlyph overrides

- **WHEN** authenticated user creates a project without supplying `color` or `iconGlyph`
- **THEN** the stored project data omits the `color` and `iconGlyph` fields
- **AND** the project's favicon is derived from its `id` and `name`

#### Scenario: Create project with explicit color override

- **WHEN** authenticated user creates a project supplying `color: "#ff5500"`
- **THEN** the stored project data includes `color: "#ff5500"`
- **AND** the project's favicon uses `#ff5500` as its background instead of the hue derived from its `id`

#### Scenario: Create project with explicit iconGlyph override

- **WHEN** authenticated user creates a project supplying `iconGlyph: "Z"`
- **THEN** the stored project data includes `iconGlyph: "Z"`
- **AND** the project's favicon renders the glyph `Z` instead of the first grapheme of its `name`