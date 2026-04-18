## ADDED Requirements

### Requirement: Clickable file references in agent chat messages
The system SHALL render file-like references in agent (assistant) chat messages as clickable controls that open the file finder.

#### Scenario: Open file finder from a relative path token
- **GIVEN** an agent message contains `src/routes.ts`
- **WHEN** the user clicks that token in the agent message
- **THEN** the file finder dialog opens
- **AND** the file finder input is prefilled with `src/routes.ts`
- **AND** the prefilled text is selected

#### Scenario: Open file finder from a dot-relative path token
- **GIVEN** an agent message contains `./README.md`
- **WHEN** the user clicks that token
- **THEN** the file finder dialog opens with `README.md`-equivalent search behavior

#### Scenario: Preserve original message text for copy
- **GIVEN** an agent message contains clickable file references
- **WHEN** the user copies that message
- **THEN** the copied text matches the original plain message text

### Requirement: Extension-based file token detection
The system SHALL identify file-like tokens using a fixed list of known file extensions, with the ability to extend that list via `chatFileExtensions` in the mimo config YAML.

#### Scenario: Token with known extension is linkable
- **GIVEN** an agent message contains `service.ts`
- **WHEN** the message is rendered
- **THEN** `service.ts` is rendered as a clickable file reference

#### Scenario: Token with unknown extension is not linkable
- **GIVEN** an agent message contains `1.2.3` or `v2.0`
- **WHEN** the message is rendered
- **THEN** those tokens are rendered as plain text, not clickable

#### Scenario: Custom extension added via config
- **GIVEN** the mimo config YAML contains `chatFileExtensions: [".proto"]`
- **WHEN** an agent message contains `schema.proto`
- **THEN** `schema.proto` is rendered as a clickable file reference

### Requirement: File finder path-first search priority
The system SHALL prioritize path-based matches before filename-only matches.

#### Scenario: Path match ranks above filename fallback
- **GIVEN** a search query of `src/service`
- **AND** results include a direct path match and a filename-only match
- **WHEN** results are displayed
- **THEN** the direct path match appears before the filename-only match

#### Scenario: Absolute path resolves relative workspace file
- **GIVEN** repository file `src/routes.ts` exists
- **WHEN** search query is `/workspace/project/src/routes.ts`
- **THEN** `src/routes.ts` is returned as a match
