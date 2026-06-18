## ADDED Requirements

### Requirement: Markdown view mode

The system SHALL provide a third per-message view mode, "markdown", for assistant message boxes. In markdown mode the message's raw text (`dataset.rawText`) SHALL be rendered as full markdown via the vendored `marked` library (`marked.parse`) and assigned to the `.message-content` element's `innerHTML`. Markdown mode SHALL support standard markdown constructs including tables, ordered/unordered (and nested) lists, blockquotes, headings, and fenced code blocks.

The rendered HTML SHALL NOT be sanitized before assignment to `innerHTML`. This is a deliberate, accepted trade-off: agent output is treated as trusted-enough for this product, and no HTML sanitizer (e.g. DOMPurify) is introduced. If agent output contains hostile HTML, it may execute in the browser.

#### Scenario: Markdown table renders as HTML table
- **WHEN** an assistant message containing GitHub-flavored markdown table syntax is in markdown mode
- **THEN** the `.message-content` contains an HTML `<table>` with the corresponding rows and cells

#### Scenario: Markdown list renders as HTML list
- **WHEN** an assistant message containing markdown list syntax is in markdown mode
- **THEN** the `.message-content` contains the corresponding `<ul>`/`<ol>` with `<li>` items

#### Scenario: Raw HTML is not sanitized
- **WHEN** an assistant message whose raw text contains HTML is rendered in markdown mode
- **THEN** the HTML is passed through `marked` output to `innerHTML` without a sanitization step

#### Scenario: Rendered from raw text
- **WHEN** markdown mode is rendered for a message
- **THEN** the source content is the message's `dataset.rawText`, not the currently displayed (decorated/plain) DOM

### Requirement: Three-way view toggle cycle

The per-message toggle button SHALL cycle through three view modes in order: decorated → plain → markdown → decorated. The toggle state SHALL remain per-message (independent of other messages) and SHALL re-render only the clicked message's content from its `dataset.rawText`. The button's title (and any visual indicator) SHALL reflect the current mode across all three states. The default state on render SHALL remain decorated.

#### Scenario: Cycle advances through all three modes
- **WHEN** the user clicks the toggle on an assistant message currently in decorated mode
- **THEN** the mode becomes plain; a second click makes it markdown; a third click returns it to decorated

#### Scenario: Toggle is per-message
- **WHEN** the user changes one assistant message to markdown mode
- **THEN** other assistant messages retain their own independent view modes

#### Scenario: Button reflects current mode
- **WHEN** an assistant message is in a given view mode
- **THEN** the toggle button's title indicates that mode

### Requirement: Markdown mode styling

Chat CSS SHALL style markdown elements rendered inside `.message-content` so that tables, lists, blockquotes, headings, and code blocks are legible (e.g. tables have visible cell borders, lists are indented).

#### Scenario: Table is styled
- **WHEN** a markdown-mode message renders a table
- **THEN** CSS rules scoped to `.message-content` apply borders/spacing so the table is readable
