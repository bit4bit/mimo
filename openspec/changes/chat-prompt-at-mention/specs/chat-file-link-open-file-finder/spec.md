## MODIFIED Requirements

### Requirement: Clickable file references in agent chat messages

The system SHALL render file-like references in agent (assistant) chat messages as clickable controls that open the file finder.

The file finder SHALL support a callback mode where file selection invokes a provided `onSelect` function instead of the default edit-buffer behavior.

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

#### Scenario: File finder opened in mention mode calls onSelect

- **WHEN** `openFileFinder` is called with `{ mode: "mention", onSelect: callback }`
- **AND** the user selects a file
- **THEN** the `onSelect` callback is called with the selected file info
- **AND** the default `selectFile` behavior is NOT triggered
- **AND** the file finder dialog closes
