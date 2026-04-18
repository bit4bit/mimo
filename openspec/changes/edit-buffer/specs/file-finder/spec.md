## ADDED Requirements

### Requirement: File Finder Dialog
The system SHALL display a file finder dialog when user presses `Mod+Shift+F` keybinding.

#### Scenario: Open file finder
- **WHEN** user presses `Mod+Shift+F`
- **THEN** the file finder dialog appears overlaying the current view

#### Scenario: Type to search files
- **GIVEN** the file finder dialog is open
- **WHEN** user types a pattern in the search input
- **THEN** the file list updates to show files matching the pattern
- **AND** matching is done on file name (not full path)
- **AND** matching is case-insensitive

#### Scenario: Navigate results with keyboard
- **GIVEN** the file finder dialog is open with search results
- **WHEN** user presses `ArrowDown`
- **THEN** the selection moves to the next file in the list
- **WHEN** user presses `ArrowUp`
- **THEN** the selection moves to the previous file in the list
- **AND** selection wraps around from first to last and vice versa

#### Scenario: Select file with Enter
- **GIVEN** the file finder dialog is open with a file selected
- **WHEN** user presses `Enter`
- **THEN** the dialog closes
- **AND** the selected file opens in the EditBuffer
- **AND** if the file was already open, it becomes the active tab

#### Scenario: Cancel file finder
- **GIVEN** the file finder dialog is open
- **WHEN** user presses `Escape`
- **THEN** the dialog closes without opening a file
- **WHEN** user clicks outside the dialog
- **THEN** the dialog closes without opening a file

---

### Requirement: Edit Buffer - Multiple Files
The system SHALL allow multiple files to be open simultaneously in the EditBuffer.

#### Scenario: Open multiple files
- **GIVEN** one file is already open in EditBuffer
- **WHEN** user opens another file via file finder
- **THEN** both files are shown as tabs
- **AND** the newly opened file becomes the active tab

#### Scenario: Display file tabs (Chat threads style)
- **GIVEN** multiple files are open
- **THEN** a tab bar is displayed at the top (like ChatThreadsBuffer)
- **AND** each tab shows a file icon and filename
- **AND** the active tab is visually distinguished with background color
- **AND** tabs are ordered by open sequence (first opened on left)
- **AND** an "+ Open File" button appears after the tabs (like "+ New Thread")
- **AND** the tab bar has horizontal scroll if many files are open

#### Scenario: Display file context bar with close button
- **GIVEN** a file is active in EditBuffer
- **THEN** a context bar is displayed below the tabs (like ChatThreadsBuffer)
- **AND** the context bar shows: file path, line count, language
- **AND** the context bar has a "Close" button on the far right
- **AND** the button is pushed right by a flex spacer (flex: 1)
- **AND** clicking the button closes the currently active file

#### Scenario: Click to switch tabs
- **GIVEN** multiple files are open
- **WHEN** user clicks a tab
- **THEN** that file's content is displayed
- **AND** the clicked tab becomes the active tab
- **AND** the context bar updates to show the new file's metadata

---

### Requirement: Edit Buffer - File Navigation
The system SHALL allow keyboard navigation between open files.

#### Scenario: Navigate to next file
- **GIVEN** multiple files are open in EditBuffer
- **WHEN** user presses `Mod+Shift+ArrowRight`
- **THEN** the next file in the tab order becomes active
- **AND** if currently on the last file, it wraps to the first file

#### Scenario: Navigate to previous file
- **GIVEN** multiple files are open in EditBuffer
- **WHEN** user presses `Mod+Shift+ArrowLeft`
- **THEN** the previous file in the tab order becomes active
- **AND** if currently on the first file, it wraps to the last file

---

### Requirement: File Content Display
The system SHALL display file contents with syntax highlighting.

#### Scenario: Display file content
- **GIVEN** a file is open in EditBuffer
- **THEN** the file content is displayed in a scrollable view
- **AND** line numbers are shown on the left
- **AND** content uses monospace font

#### Scenario: Syntax highlighting (using highlight.js)
- **GIVEN** a file is open in EditBuffer
- **THEN** the file content is displayed with syntax highlighting via highlight.js
- **AND** the language is detected from the file extension
- **AND** highlight.js Atom One Dark theme is used (matches the dark UI theme)
- **AND** line numbers are shown on the left of the code
- **AND** content uses monospace font
- **AND** if highlight.js fails to highlight (unsupported language), plain text with HTML escaping is shown

#### Scenario: Supported languages via highlight.js
- **GIVEN** highlight.js is loaded via CDN
- **THEN** all 190+ languages supported by highlight.js are available
- **AND** including but not limited to: TypeScript, JavaScript, JSON, Markdown, YAML, HTML, CSS, Python, Rust, Go, etc.

#### Scenario: Scroll with PageUp/PageDown
- **GIVEN** a file with content larger than the viewport is open
- **WHEN** user presses `PageUp`
- **THEN** the view scrolls up by one page
- **WHEN** user presses `PageDown`
- **THEN** the view scrolls down by one page

#### Scenario: Scroll with arrow keys
- **GIVEN** a file with content larger than the viewport is open
- **WHEN** user presses `ArrowUp`
- **THEN** the view scrolls up by one line
- **WHEN** user presses `ArrowDown`
- **THEN** the view scrolls down by one line

---

### Requirement: Supported Languages
The system SHALL support syntax highlighting for the following languages:

#### Scenario: TypeScript files
- **GIVEN** a file with `.ts` or `.tsx` extension is open
- **THEN** highlight.js TypeScript syntax highlighting is applied

#### Scenario: JavaScript files
- **GIVEN** a file with `.js` or `.jsx` extension is open
- **THEN** highlight.js JavaScript syntax highlighting is applied

#### Scenario: JSON files
- **GIVEN** a file with `.json` extension is open
- **THEN** highlight.js JSON syntax highlighting is applied

#### Scenario: Markdown files
- **GIVEN** a file with `.md` extension is open
- **THEN** highlight.js Markdown syntax highlighting is applied

#### Scenario: YAML files
- **GIVEN** a file with `.yml` or `.yaml` extension is open
- **THEN** highlight.js YAML syntax highlighting is applied

#### Scenario: Unknown file types
- **GIVEN** a file with an unrecognized extension is open
- **THEN** highlight.js auto-detection is attempted
- **AND** if detection fails, plain text with HTML escaping is shown

---

### Requirement: Keybindings Configuration
The system SHALL support configurable keybindings for edit buffer operations.

#### Scenario: Default keybindings
- **GIVEN** no custom keybindings are configured
- **THEN** the following defaults apply:
  - `Mod+Shift+F`: Open file finder
  - `Mod+Shift+ArrowRight`: Next file
  - `Mod+Shift+ArrowLeft`: Previous file
  - `Mod+W`: Close current file
  - `Escape`: Close file finder (when open)

#### Scenario: Custom keybindings from config
- **GIVEN** custom keybindings are defined in `config.yaml`
- **THEN** the custom keybindings override defaults
- **AND** they apply to edit buffer operations
