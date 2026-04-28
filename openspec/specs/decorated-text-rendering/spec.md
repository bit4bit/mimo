## Capability: Decorated Text Rendering

Agent messages are rendered with visual markdown styling while keeping syntax markers visible. Users can toggle per-message between decorated and plain views.

## Behaviors

### Decorated Mode (default)

- **Bold**: Text wrapped in `**` or `__` renders bold with markers visible
- **Italic**: Text wrapped in `*` or `_` renders italic with markers visible
- **Inline code**: Text wrapped in backticks renders with monospace font and background, backticks visible
- **Fenced code blocks**: Lines between ` ``` ` markers render in a dark box with monospace font; fence markers and language tag visible
- **Links**: `[text](url)` renders with full syntax visible; the entire text is a clickable link opening in a new tab
- **File references**: Tokens matching known file extensions render as clickable `chat-file-ref` buttons (existing behavior preserved)
- **Unrecognized syntax**: Passes through as plain text

### Plain Mode

- Raw text displayed with no styling, no links, no file-ref buttons
- Newlines preserved, empty lines shown as blank lines
- Exact content matches `dataset.rawText`

### Toggle Button

- Eye icon button in agent message header, left of copy button
- Click toggles between decorated and plain
- Toggle state is per-message (independent of other messages)
- Default state: decorated (active)
- Visual indicator: button appears slightly brighter when decorated mode is active
- Re-renders message content from `dataset.rawText` on toggle

### Streaming

- During streaming, new chunks render in the current toggle mode (decorated by default)
- Toggle is functional during streaming
- On finalize, content is re-rendered in current toggle mode via `renderAgentMessageContent` or `renderDecoratedContent`

### User Messages

- No toggle button
- No decorated rendering
- User messages render exactly as they do today

## Edge Cases

- Unclosed `**` or `*` at end of line: treat as literal text, no decoration
- Nested markers (`***bold-italic***`): bold takes precedence
- Backticks inside fenced blocks: no double-processing
- Empty fenced blocks: render the fence markers with empty styled block
- `[text](url)` where URL contains parentheses: basic regex may not handle; acceptable to treat as plain text
