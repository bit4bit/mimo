## MODIFIED Requirements

### Requirement: Ignore Files

The system SHALL exclude files matching patterns defined in `.gitignore` and `.mimoignore` from the file finder results.

#### Scenario: No ignore files present

- **GIVEN** neither `.gitignore` nor `.mimoignore` exists in the workspace root
- **WHEN** the file finder lists files
- **THEN** all tracked files are returned without user-defined filtering
- **AND** built-in excluded paths (`.git`, `.fossil`, `.fossil-settings`, `.mimo`, etc.) are still excluded from results

#### Scenario: User-defined ignore file present

- **GIVEN** `.gitignore` exists in the workspace root
- **WHEN** the file finder lists files
- **THEN** files matching `.gitignore` patterns are excluded
- **AND** built-in excluded paths are also excluded

### Requirement: File Finder Dialog

The system SHALL display a file finder dialog when user presses `Mod+Shift+F` keybinding.

#### Scenario: File finder excludes built-in system paths

- **GIVEN** the file finder dialog is open
- **AND** the workspace contains `.git/config`, `.fossil-settings/ignore-glob`, or `.mimo/patches`
- **WHEN** the file list is displayed
- **THEN** these VCS-internal and Mimo-internal paths are not shown
- **AND** only user-visible project files appear
