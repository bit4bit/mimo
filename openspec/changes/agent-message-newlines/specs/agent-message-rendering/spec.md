## ADDED Requirements

### Requirement: Agent message newlines are preserved as block structure
Agent message content SHALL be rendered as a sequence of block elements (one `<div>` per line) so that newlines survive copy-paste into external applications regardless of clipboard format (text/html or text/plain).

#### Scenario: Single newline in agent response
- **WHEN** an agent message contains a single `\n` between two lines of text
- **THEN** each line is rendered in a separate `<div>` element in the DOM

#### Scenario: Empty line in agent response
- **WHEN** an agent message contains `\n\n` (a blank line between paragraphs)
- **THEN** the empty line is rendered as `<div><br></div>` to preserve vertical space

#### Scenario: Pasting agent content into a rich text editor
- **WHEN** a user selects and copies agent message content and pastes into a rich text editor (e.g. Notion, Slack, Google Docs)
- **THEN** the pasted text preserves line breaks as separate lines

#### Scenario: Pasting agent content into a plain text editor
- **WHEN** a user uses the copy button (📋) on an agent message and pastes into a plain text editor
- **THEN** the pasted text preserves line breaks with `\n` characters

### Requirement: Line rendering is consistent between streamed and historical messages
Agent messages rendered during streaming and messages reconstructed from chat history SHALL use the same line-based rendering.

#### Scenario: Streamed message finalization
- **WHEN** an agent message finishes streaming
- **THEN** the streamed content is converted to per-line `<div>` block structure

#### Scenario: History reconstruction
- **WHEN** the chat view loads and reconstructs messages from history
- **THEN** agent message content is rendered using per-line `<div>` block structure

### Requirement: Copy button produces plain text with newlines
The copy button (📋) on agent messages SHALL copy the message text to the clipboard as plain text with `\n` characters between lines.

#### Scenario: Copy button on multi-line message
- **WHEN** a user clicks the copy button on an agent message with multiple lines
- **THEN** the clipboard contains the message text with `\n` between each line and no extra content from hidden sections (e.g. thought process)
