## ADDED Requirements

### Requirement: Streaming message content is incrementally rendered with decorations

During streaming, agent message content SHALL be rendered through `renderDecoratedContent` on a throttled basis as chunks arrive, instead of appending raw text via `textContent +=`. The accumulated text SHALL be stored in `ChatState.streaming.content` as the single source of truth.

#### Scenario: message chunk triggers throttled decorated render

- **WHEN** a `message_chunk` WebSocket event is received and the streaming message element exists
- **THEN** the chunk text is appended to `ChatState.streaming.content`, and a throttled render is scheduled (if not already pending)

#### Scenario: throttled render executes

- **WHEN** the throttle timer fires (~150ms after the last chunk)
- **THEN** `renderDecoratedContent` is called with the full accumulated text from `ChatState.streaming.content`, replacing the response element content

#### Scenario: rapid chunks are batched

- **WHEN** multiple `message_chunk` events arrive within 150ms
- **THEN** only one `renderDecoratedContent` call occurs after the timer fires, using the full accumulated text

### Requirement: Typing cursor appears after each streaming re-render

After each throttled `renderDecoratedContent` call during streaming, a typing cursor element SHALL be appended as the last child of the response element.

#### Scenario: cursor visible during streaming decorated render

- **WHEN** a throttled render executes during streaming
- **THEN** a `<span class="typing-cursor">` element is appended as the last child of the response element after the decorated content

#### Scenario: cursor removed on finalization

- **WHEN** `finalizeMessageStream` is called
- **THEN** the typing cursor element is removed before the final `renderDecoratedContent` call

### Requirement: Toggle button works during streaming

The decorated/plain toggle button SHALL remain functional during streaming.

#### Scenario: toggle from decorated to plain during streaming

- **WHEN** the user clicks the toggle button while streaming in decorated mode
- **THEN** the response element is re-rendered with `renderPlainContent`, `dataset.viewMode` is set to `"plain"`, and new chunks are appended via `textContent +=` without throttled re-rendering

#### Scenario: toggle from plain to decorated during streaming

- **WHEN** the user clicks the toggle button while streaming in plain mode
- **THEN** the response element is re-rendered with `renderDecoratedContent` using the accumulated text, `dataset.viewMode` is set to `"decorated"`, and throttled re-rendering resumes

#### Scenario: finalization respects current view mode

- **WHEN** `finalizeMessageStream` is called while the message is in plain view mode
- **THEN** the content is finalized with `renderPlainContent`

### Requirement: Fenced code blocks receive syntax highlighting

Fenced code blocks SHALL be syntax-highlighted using highlight.js when a language tag is detected in the opening fence line.

#### Scenario: fenced block with recognized language tag

- **WHEN** `renderDecoratedContent` creates a `.decorated-fence` element with a language tag (e.g., `` ```typescript ``)
- **THEN** `hljs.highlightElement` is called on the fence's code lines, applying syntax highlighting

#### Scenario: fenced block without language tag

- **WHEN** `renderDecoratedContent` creates a `.decorated-fence` element with no language tag (bare `` ``` ``)
- **THEN** no syntax highlighting is applied; the fence renders with monospace font via CSS only

#### Scenario: syntax highlighting during streaming

- **WHEN** a fenced code block is rendered during a throttled streaming re-render
- **THEN** syntax highlighting is applied if the fence is closed and the language tag is recognized

#### Scenario: syntax highlighting on finalization

- **WHEN** `renderDecoratedContent` is called on finalization
- **THEN** syntax highlighting is applied to all fenced code blocks with recognized language tags

### Requirement: Large messages degrade gracefully

When the accumulated streaming text exceeds a threshold, the throttled render interval SHALL increase to avoid performance issues.

#### Scenario: long message increases throttle

- **WHEN** `ChatState.streaming.content.length` exceeds 50000 characters
- **THEN** the throttle interval increases to ~500ms

#### Scenario: normal-length message uses standard throttle

- **WHEN** `ChatState.streaming.content.length` is below 50000 characters
- **THEN** the throttle interval is ~150ms