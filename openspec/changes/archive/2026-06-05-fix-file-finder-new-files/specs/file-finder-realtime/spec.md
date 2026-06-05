## ADDED Requirements

### Requirement: File listing reflects filesystem state

The file listing endpoint SHALL enumerate files from the actual filesystem using recursive directory traversal, filtered by the path exclusion policy and ignore patterns. The listing SHALL NOT depend on VCS tracking status.

#### Scenario: New file appears in listing immediately

- **GIVEN** a file `src/new-feature.ts` has been written to disk by the LLM agent
- **AND** the file has NOT been added to Fossil tracking
- **WHEN** the file listing endpoint is called
- **THEN** `src/new-feature.ts` SHALL appear in the listing

#### Scenario: VCS-internal directories are excluded

- **GIVEN** directories `.git`, `.fossil`, `.fslckout` exist in the workspace
- **WHEN** the file listing endpoint is called
- **THEN** files inside those directories SHALL NOT appear in the listing

#### Scenario: Ignore patterns are respected

- **GIVEN** a `.gitignore` containing `node_modules/`
- **WHEN** the file listing endpoint is called
- **THEN** files inside `node_modules/` SHALL NOT appear in the listing

#### Scenario: Deleted files are removed from listing

- **GIVEN** a file `src/old.ts` has been deleted from disk
- **WHEN** the file listing endpoint is called
- **THEN** `src/old.ts` SHALL NOT appear in the listing

### Requirement: File finder cache invalidates on file changes

The browser-side file finder SHALL invalidate its cached file list when the server notifies it that files have changed, so that newly created files appear without a page reload.

#### Scenario: New file appears after agent creates it

- **GIVEN** the file finder has been opened at least once (cache populated)
- **AND** the LLM agent creates a new file on disk
- **WHEN** the server sends a `file_list_invalidated` WebSocket event
- **THEN** the file finder SHALL mark its cache as stale
- **AND** the next time the file finder opens, it SHALL re-fetch the file list from the server

#### Scenario: File finder shows cached results when no changes

- **GIVEN** the file finder has been opened once and no files have changed
- **WHEN** the file finder is opened again
- **THEN** the file finder SHALL use its cached file list without re-fetching

#### Scenario: Cache resets on page reload

- **GIVEN** the user reloads the page
- **WHEN** the file finder is first opened after reload
- **THEN** the file list SHALL be fetched from the server