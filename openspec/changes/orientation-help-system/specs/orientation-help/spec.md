## ADDED Requirements

### Requirement: Help content source
The system SHALL read help documentation from `~/.mimo/help.yaml`.

#### Scenario: Load help on server startup
- **WHEN** the server starts
- **THEN** it SHALL resolve the path to help.yaml using the `MIMO_HOME` environment variable or default to `~/.mimo/help.yaml`

#### Scenario: Missing help file
- **WHEN** the help file does not exist
- **THEN** the `/api/help` endpoint SHALL return an empty JSON object `{}`

### Requirement: Help API endpoint
The system SHALL expose a `GET /api/help` endpoint that returns help content as JSON.

#### Scenario: Request help content
- **WHEN** a client sends a GET request to `/api/help`
- **THEN** the server SHALL parse the YAML file and return JSON with the structure `{ "help-id": { "title": "...", "content": "..." } }`

#### Scenario: YAML parse error
- **WHEN** the help.yaml file contains invalid YAML
- **THEN** the endpoint SHALL return HTTP 500 with an error message describing the parse failure

### Requirement: Tooltip display on hover
The system SHALL display tooltips when users hover over elements with `data-help-id` attributes.

#### Scenario: Valid help ID exists
- **GIVEN** an element has `data-help-id="session-chat-input"`
- **AND** the help.yaml contains an entry for `session-chat-input`
- **WHEN** the user hovers over the element for 500ms
- **THEN** a tooltip SHALL appear showing the title and rendered markdown content

#### Scenario: Help ID not found
- **GIVEN** an element has `data-help-id="unknown-id"`
- **AND** no entry exists in help.yaml
- **WHEN** the user hovers over the element
- **THEN** no tooltip SHALL appear (silent fallback)

#### Scenario: Quick hover exit
- **GIVEN** a user hovers over a help-enabled element
- **WHEN** they move the mouse away before 500ms
- **THEN** no tooltip SHALL appear

### Requirement: Tooltip positioning
The system SHALL position tooltips relative to the hovered element.

#### Scenario: Default positioning
- **GIVEN** a tooltip is about to be shown
- **WHEN** there is sufficient space above the element
- **THEN** the tooltip SHALL appear above the element, centered horizontally

#### Scenario: Viewport edge collision
- **GIVEN** an element is near the viewport edge
- **WHEN** the default position would place the tooltip outside the viewport
- **THEN** the tooltip SHALL adjust position to remain fully visible

### Requirement: Markdown rendering
The system SHALL render help content as HTML from markdown.

#### Scenario: Basic markdown support
- **GIVEN** help content contains `**bold**`, `*italic*`, `` `code` ``, and `[links](url)`
- **WHEN** the tooltip is displayed
- **THEN** the content SHALL render with appropriate HTML formatting

#### Scenario: Multi-line content
- **GIVEN** help content contains multiple lines and paragraphs
- **WHEN** the tooltip is displayed
- **THEN** the content SHALL render with proper line breaks and paragraph separation

### Requirement: Markdown renderer seam
The system SHALL allow swapping the markdown parser implementation.

#### Scenario: Default implementation
- **WHEN** the tooltip system initializes
- **THEN** it SHALL use the `MarkedRenderer` by default

#### Scenario: Custom implementation
- **GIVEN** a developer provides a custom `MarkdownRenderer` implementation
- **WHEN** they call `createMarkdownRenderer('custom')`
- **THEN** the system SHALL use the custom implementation

### Requirement: Tooltip dismissal
The system SHALL hide tooltips when users move their mouse away.

#### Scenario: Mouse leave
- **GIVEN** a tooltip is currently visible
- **WHEN** the user moves the mouse away from the element
- **THEN** the tooltip SHALL hide after a 200ms delay

### Requirement: Help ID naming
The system SHALL use contextual flat IDs for help entries.

#### Scenario: ID format validation
- **GIVEN** a generated help ID
- **THEN** it SHALL follow the pattern `<page>-<section>-<element>` in kebab-case
- **AND** contain only lowercase letters, numbers, and hyphens

#### Scenario: Example IDs
- **GIVEN** various UI elements
- **THEN** IDs SHALL match: `dashboard-stats-projects`, `session-chat-input`, `project-create-form-name`
