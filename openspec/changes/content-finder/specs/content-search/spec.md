## ADDED Requirements

### Requirement: Content search via keyboard shortcut
The system SHALL provide a keyboard shortcut to open a content search dialog.

#### Scenario: User opens content finder
- **WHEN** user presses Alt+Shift+C
- **THEN** a content search dialog opens
- **AND** the dialog is modal and centered on screen
- **AND** the input field has focus

### Requirement: Search with debounced live results
The system SHALL search file contents as the user types with a 300ms debounce.

#### Scenario: User types a search query
- **WHEN** user types "validateToken" in the search input
- **AND** waits 300ms without typing
- **THEN** the system searches file contents
- **AND** results appear in the dialog

#### Scenario: User types rapidly
- **WHEN** user types "val" then "id" then "ate" with less than 300ms between each
- **THEN** only one search executes after the final keystroke
- **AND** the search query is "validate"

### Requirement: Content search results format
The system SHALL return search results containing file path, line number, match text, and context lines.

#### Scenario: Search finds matches
- **WHEN** user searches for "validateToken"
- **THEN** each result SHALL include:
  - The file path relative to workspace root
  - The line number (1-based) of the match
  - The column position (0-based byte offset) of the match
  - The full text of the matching line
  - 2 lines of context before the match
  - 2 lines of context after the match
  - The start and end indices of the match within the line

#### Scenario: Multiple matches in one file
- **WHEN** user searches for a pattern matching multiple lines in one file
- **THEN** each match SHALL be a separate result
- **AND** each result SHALL have its own line number and context

### Requirement: Regex search with case insensitivity
The system SHALL treat search queries as regular expressions, case insensitive.

#### Scenario: User searches with regex pattern
- **WHEN** user searches for "validate.*Token"
- **THEN** the system SHALL match "validateToken", "validateMyToken", etc.
- **AND** the search SHALL be case insensitive (matching "ValidateToken", "VALIDATETOKEN")

#### Scenario: User searches with literal special characters
- **WHEN** user searches for "foo.bar"
- **THEN** the system SHALL match "fooXbar", "foo-bar" (any char between)
- **AND** to match literally, user MUST escape as "foo\\.bar"

### Requirement: Result navigation
The system SHALL allow keyboard navigation through search results.

#### Scenario: User navigates results with Tab
- **GIVEN** search results are displayed
- **WHEN** user presses Tab
- **THEN** the next result is selected
- **AND** when the last result is selected, Tab wraps to the first result

#### Scenario: User navigates results with Shift+Tab
- **GIVEN** search results are displayed
- **WHEN** user presses Shift+Tab
- **THEN** the previous result is selected
- **AND** when the first result is selected, Shift+Tab wraps to the last result

#### Scenario: User navigates results with Arrow keys
- **GIVEN** search results are displayed
- **WHEN** user presses Down arrow
- **THEN** the next result is selected
- **WHEN** user presses Up arrow
- **THEN** the previous result is selected

### Requirement: Open file from search result
The system SHALL open the selected file at the match position when user confirms.

#### Scenario: User opens a result
- **GIVEN** a search result is selected
- **WHEN** user presses Enter
- **THEN** the content search dialog closes
- **AND** the file opens in the editor
- **AND** the editor scrolls to the matching line
- **AND** the cursor positions at the start of the match

### Requirement: Error handling for invalid regex
The system SHALL display a helpful error when the search query is an invalid regular expression.

#### Scenario: User enters invalid regex
- **WHEN** user searches for "(validateToken" (unclosed group)
- **THEN** the system SHALL display an error message
- **AND** the error SHALL explain the regex is invalid
- **AND** the error SHALL provide tips for escaping special characters

### Requirement: Error handling for missing ripgrep
The system SHALL display installation instructions when ripgrep is not installed.

#### Scenario: ripgrep not found
- **GIVEN** the ripgrep binary is not available on the system
- **WHEN** user attempts to search
- **THEN** the system SHALL display an error message
- **AND** the error SHALL include installation instructions for common platforms (apt, brew, etc.)

### Requirement: Empty results state
The system SHALL display a helpful message when no matches are found.

#### Scenario: Search returns no results
- **WHEN** user searches for a pattern with no matches
- **THEN** the system SHALL display "No matches found"
- **AND** the message SHALL suggest trying fewer characters or different spelling

### Requirement: Result limits
The system SHALL limit search results to prevent performance issues.

#### Scenario: Search finds many matches
- **WHEN** user searches for a pattern matching more than 100 results
- **THEN** the system SHALL return only the first 100 results
- **AND** the system SHALL display a "Results truncated" indicator
- **AND** the total count SHALL indicate how many were found vs returned

### Requirement: Cancel in-flight searches
The system SHALL cancel previous searches when a new search is triggered.

#### Scenario: User types quickly after debounce
- **GIVEN** a search is in progress
- **WHEN** user types another character triggering a new search
- **THEN** the previous search request SHALL be cancelled
- **AND** only the latest search results SHALL be displayed
