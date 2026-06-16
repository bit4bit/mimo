## ADDED Requirements

### Requirement: File listing endpoint supports pagination

The system SHALL support returning a bounded page of files from the file finder endpoint.

#### Scenario: Request first page

- **WHEN** the client requests files with limit=50 and no cursor
- **THEN** the system returns up to 50 files
- **AND** includes a cursor for the next page if more files exist
- **AND** includes a hasMore flag

### Requirement: File listing endpoint supports search

The system SHALL filter files server-side by a query string during traversal.

#### Scenario: Search with pagination

- **WHEN** the client requests files with query="app" and limit=20
- **THEN** the system returns up to 20 files whose path or basename contains "app"
- **AND** scoring matches the existing client-side ranking order
- **AND** the response includes the next cursor if more matches exist

### Requirement: Paginated response shape

The system SHALL return a structured response for paginated requests.

#### Scenario: Paginated request

- **WHEN** the client includes a limit parameter
- **THEN** the response is { files: FileInfo[], nextCursor: string|null, hasMore: boolean }
- **AND** the response is valid JSON

### Requirement: Backwards-compatible fallback

The system SHALL preserve the original flat array response when no pagination parameters are provided.

#### Scenario: Legacy request without pagination

- **WHEN** the client requests files without limit or cursor
- **THEN** the system returns the existing array of all files
- **AND** behavior matches the previous implementation

### Requirement: Walker stops early after collecting enough results

The system SHALL avoid traversing the entire repository once the requested page plus one result is collected.

#### Scenario: Small query matches few files

- **WHEN** the client requests files with query="README" and limit=10
- **AND** only 5 files match
- **THEN** the system does not enumerate all remaining files
- **AND** returns hasMore=false
