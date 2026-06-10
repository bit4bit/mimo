## MODIFIED Requirements

### Requirement: Streaming

- **FROM**:
  During streaming, new chunks render in the current toggle mode (decorated by default)
  Toggle is functional during streaming
  On finalize, content is re-rendered in current toggle mode via `renderAgentMessageContent` or `renderDecoratedContent`

- **TO**:
  During streaming, new chunks are accumulated in `ChatState.streaming.content` and rendered through `renderDecoratedContent` on a throttled basis (~150ms, increasing to ~500ms for messages exceeding 50000 characters), providing paragraph gaps, bold/italic/code styling, and fenced code blocks while content is still arriving
  A typing cursor is appended after each throttled re-render
  Toggle is functional during streaming — switching to plain mode suspends throttled re-rendering and falls back to `textContent +=`; switching back to decorated mode resumes throttled re-rendering
  On finalize, content is re-rendered in current toggle mode via `renderDecoratedContent` or `renderPlainContent`; no visual jump occurs since decorated content was already visible during streaming

## ADDED Requirements

### Requirement: Fenced code blocks are syntax-highlighted

Fenced code blocks SHALL apply syntax highlighting via highlight.js when a recognized language tag is present in the opening fence line.

#### Scenario: fenced block with language tag is highlighted

- **WHEN** `renderDecoratedContent` renders a fenced code block with a language tag (e.g., `` ```typescript ``)
- **THEN** the code lines within the fence element are highlighted using `hljs.highlightElement`

#### Scenario: fenced block without language tag is not highlighted

- **WHEN** `renderDecoratedContent` renders a fenced code block with no language tag
- **THEN** the code lines render with monospace font and background via CSS, with no syntax highlighting applied