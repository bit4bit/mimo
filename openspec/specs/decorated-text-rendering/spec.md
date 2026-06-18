## Purpose

Agent messages in the chat thread are rendered with readable styling. Each assistant message offers a per-message view toggle that cycles through three rendering modes — decorated (custom inline markup with syntax markers visible), plain (raw text), and markdown (full markdown via the `marked` library) — so users can read structured agent output in the form they prefer.

## Requirements

### Requirement: Decorated mode rendering

In decorated mode (the default) agent message text SHALL render with visual styling while keeping syntax markers visible: bold (`**`/`__`), italic (`*`/`_`), inline code (backticks), fenced code blocks (` ``` `), links (`[text](url)` fully visible and clickable in a new tab), and headings. Tokens matching known file extensions SHALL render as clickable `chat-file-ref` buttons. Unrecognized syntax SHALL pass through as plain text. All text SHALL be HTML-escaped before decoration.

#### Scenario: Bold text is decorated with markers visible
- **WHEN** an agent message containing `**bold**` renders in decorated mode
- **THEN** the text shows as bold with the `**` markers still visible

#### Scenario: Script injection is escaped
- **WHEN** an agent message containing `<script>` renders in decorated mode
- **THEN** the angle brackets are HTML-escaped and no script element is created

### Requirement: Plain mode rendering

In plain mode agent message text SHALL display as raw text with no styling, links, or file-ref buttons. Newlines SHALL be preserved and empty lines shown as blank lines. The displayed content SHALL match `dataset.rawText` exactly.

#### Scenario: Raw markers shown verbatim
- **WHEN** an agent message with `**bold** and \`code\`` renders in plain mode
- **THEN** the markers are shown literally with no styling applied

### Requirement: Markdown mode rendering

In markdown mode the message's raw text (`dataset.rawText`) SHALL be rendered as full markdown via the vendored `marked` library (`marked.parse`) and assigned to the `.message-content` element's `innerHTML`. Markdown mode SHALL support standard markdown constructs including tables, ordered/unordered (and nested) lists, blockquotes, headings, and fenced code blocks. When `marked` is unavailable, the system SHALL fall back to plain rendering rather than show an empty box.

The rendered HTML SHALL NOT be sanitized before assignment to `innerHTML`. This is a deliberate, accepted trade-off: agent output is treated as trusted-enough for this product, and no HTML sanitizer is introduced. If agent output contains hostile HTML, it may execute.

#### Scenario: Markdown table renders as HTML table
- **WHEN** an assistant message containing GFM table syntax is in markdown mode
- **THEN** the `.message-content` contains an HTML `<table>` with the corresponding rows and cells

#### Scenario: Markdown list renders as HTML list
- **WHEN** an assistant message containing markdown list syntax is in markdown mode
- **THEN** the `.message-content` contains the corresponding `<ul>`/`<ol>` with `<li>` items

#### Scenario: Raw HTML is not sanitized
- **WHEN** an assistant message whose raw text contains HTML is rendered in markdown mode
- **THEN** the HTML is passed through `marked` output to `innerHTML` without a sanitization step

#### Scenario: Falls back to plain when marked is missing
- **WHEN** markdown mode is requested but the `marked` library is undefined
- **THEN** the message renders as plain text instead of an empty box

### Requirement: Three-way view toggle

Each assistant message SHALL have an eye-icon toggle button in its header (left of the copy button). Clicking it SHALL cycle the view mode in order: decorated → plain → markdown → decorated. The toggle state SHALL be per-message (independent of other messages), default to decorated, and re-render only the clicked message's content from its `dataset.rawText`. The button's title SHALL reflect the current mode across all three states. User messages SHALL NOT have a toggle button.

#### Scenario: Cycle advances through all three modes
- **WHEN** the user clicks the toggle on a message in decorated mode
- **THEN** the mode becomes plain; a second click makes it markdown; a third click returns it to decorated

#### Scenario: Toggle is per-message
- **WHEN** the user changes one assistant message to markdown mode
- **THEN** other assistant messages retain their own independent view modes

#### Scenario: Button title reflects current mode
- **WHEN** an assistant message is in a given view mode
- **THEN** the toggle button's title indicates that mode

### Requirement: Markdown mode styling

Chat CSS SHALL style markdown elements rendered inside `.message-content` so that tables, lists, blockquotes, headings, and code blocks are legible (e.g. tables have visible cell borders, lists are indented).

#### Scenario: Table is styled
- **WHEN** a markdown-mode message renders a table
- **THEN** CSS rules scoped to `.message-content` apply borders and spacing so the table is readable

### Requirement: Streaming and finalize

During streaming, new chunks SHALL render in the message's current toggle mode (decorated by default), and the toggle SHALL remain functional. On finalize, content SHALL be re-rendered in the current toggle mode from `dataset.rawText`.

#### Scenario: Toggle works mid-stream
- **WHEN** the user toggles an assistant message's view mode while it is still streaming
- **THEN** the displayed content re-renders in the selected mode and continues to update
