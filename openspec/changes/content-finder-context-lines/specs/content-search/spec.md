## ADDED Requirements

### Requirement: Configurable before and after context lines

The search endpoint SHALL accept `before` and `after` query parameters specifying how many lines of context to return before and after each match. Each value SHALL be clamped to the range 0–10. A missing or non-numeric value SHALL fall back to the `context` parameter, and then to 2.

#### Scenario: Separate before and after values

- **WHEN** the client requests `/sessions/:id/search?q=foo&before=1&after=3`
- **THEN** each result SHALL contain at most 1 line in `before`
- **AND** each result SHALL contain at most 3 lines in `after`

#### Scenario: Legacy context parameter

- **WHEN** the client requests `/sessions/:id/search?q=foo&context=4` without `before` or `after`
- **THEN** the search SHALL use 4 lines before and 4 lines after

#### Scenario: Out-of-range and invalid values

- **WHEN** the client requests `before=50&after=abc`
- **THEN** the search SHALL use 10 lines before
- **AND** the search SHALL use 2 lines after

#### Scenario: Zero context

- **WHEN** the client requests `before=0&after=0`
- **THEN** every result SHALL have empty `before` and `after` arrays

### Requirement: Context lines belong to their own match

Each result's `before` array SHALL contain the file lines immediately preceding the match line, in file order, ending at `line - 1`. Each result's `after` array SHALL contain the file lines immediately following the match line, in file order, starting at `line + 1`. Context SHALL never include lines from a different file.

#### Scenario: Single match with full context

- **GIVEN** a file whose line 10 matches and lines 8, 9, 11, 12 exist
- **WHEN** searching with before=2 and after=2
- **THEN** the result for line 10 SHALL have `before` equal to lines 8–9
- **AND** `after` equal to lines 11–12

#### Scenario: Last match in a file keeps its trailing context

- **GIVEN** a file whose only match is on line 5 of 20
- **WHEN** searching with after=2
- **THEN** the result SHALL have `after` equal to lines 6–7

#### Scenario: Nearby matches share overlapping lines

- **GIVEN** a file where lines 10 and 12 both match
- **WHEN** searching with before=2 and after=2
- **THEN** the result for line 10 SHALL have `after` equal to lines 11–12
- **AND** the result for line 12 SHALL have `before` equal to lines 10–11

#### Scenario: Match near the start of a file

- **GIVEN** a file whose line 1 matches
- **WHEN** searching with before=2
- **THEN** the result SHALL have an empty `before` array

#### Scenario: Matches across files

- **GIVEN** file A matches on line 50 and file B matches on line 3
- **WHEN** searching with before=2 and after=2
- **THEN** file B's result SHALL contain only lines from file B
- **AND** file A's result SHALL contain only lines from file A

### Requirement: Accurate total result cap

The search SHALL return at most 100 results in total across all files. The response `truncated` flag SHALL be true only if more matches existed than were returned.

#### Scenario: More matches than the cap

- **GIVEN** a workspace with 150 matching lines spread across several files
- **WHEN** the user searches
- **THEN** the response SHALL contain exactly 100 results
- **AND** `truncated` SHALL be true

#### Scenario: Exactly the cap

- **GIVEN** a workspace with exactly 100 matching lines
- **WHEN** the user searches
- **THEN** the response SHALL contain 100 results
- **AND** `truncated` SHALL be false

### Requirement: Context controls in the Content Finder modal

The Content Finder modal SHALL provide two numeric inputs, one for lines before and one for lines after each match, each limited to 0–10 and defaulting to 2. The values SHALL be saved per browser and restored when the modal opens.

#### Scenario: Defaults on first use

- **GIVEN** no saved context settings
- **WHEN** the user opens the Content Finder
- **THEN** the before and after inputs SHALL both show 2

#### Scenario: Settings persist

- **GIVEN** the user set before=1 and after=5 and closed the modal
- **WHEN** the user opens the Content Finder again
- **THEN** the before input SHALL show 1
- **AND** the after input SHALL show 5

#### Scenario: Storage unavailable

- **GIVEN** browser storage throws on access
- **WHEN** the user opens the Content Finder and changes the values
- **THEN** the modal SHALL work with the in-memory values and SHALL NOT show an error

#### Scenario: Changing values re-runs the search

- **GIVEN** a search for "foo" has completed
- **WHEN** the user changes the after input from 2 to 4
- **THEN** the system SHALL re-run the search for "foo" with before=2 and after=4 after the debounce
- **AND** any in-flight search SHALL be cancelled

#### Scenario: Changing values before any search

- **GIVEN** no search has completed in the open modal
- **WHEN** the user changes the before input
- **THEN** no search SHALL be triggered

### Requirement: Render context around each result

Each result in the Content Finder SHALL display its `path:line` header followed by the context lines and the match line in file order. Each line SHALL show its line number. Context lines SHALL be visually dimmed, the match line SHALL be emphasized, and the matched substring SHALL be highlighted. All file text SHALL be HTML-escaped and SHALL keep its indentation.

#### Scenario: Result with context

- **GIVEN** a result for line 42 with two before lines and one after line
- **WHEN** the result is rendered
- **THEN** rows SHALL appear for lines 40, 41, 42, 43 in that order
- **AND** rows 40, 41, 43 SHALL be styled as context
- **AND** row 42 SHALL be styled as the match with the `matchStart`–`matchEnd` range highlighted

#### Scenario: HTML in file content

- **GIVEN** a context line containing `<script>alert(1)</script>`
- **WHEN** the result is rendered
- **THEN** the text SHALL be displayed literally and SHALL NOT be interpreted as HTML

#### Scenario: Non-ASCII text before the match

- **GIVEN** a match line `const café = foo;` where the query matches `foo`
- **WHEN** the result is rendered
- **THEN** exactly `foo` SHALL be highlighted

### Requirement: Search button in the edit buffer

The edit buffer tab bar SHALL show a search button immediately before the "+" (open file) button. Clicking it SHALL open the Content Finder, and confirming a result SHALL open that file in the edit buffer. The button SHALL stay before "+" whenever the tab bar is re-rendered.

#### Scenario: Open the content finder from the edit buffer

- **WHEN** the user clicks the search button in the edit buffer tab bar
- **THEN** the Content Finder opens

#### Scenario: Open a file from a search result

- **GIVEN** the user opened the Content Finder from the search button and searched for "foo"
- **WHEN** the user confirms a result in `a.txt`
- **THEN** the Content Finder closes
- **AND** `a.txt` opens as a tab in the edit buffer
- **AND** the tab bar order is the search button, then "+", then the file tabs

