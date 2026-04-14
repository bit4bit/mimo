## Context

Agent messages are rendered in `chat.js` via two paths:
1. **Streaming**: `updateMessageContent(text)` appends text chunks to a `div.message-response` using `textContent +=`. After streaming ends, `finalizeMessageStream()` removes the cursor.
2. **History**: `renderChatHistory()` reconstructs messages from `chat.jsonl` chunks, accumulates them into a string, then calls `insertMessage()` → `renderMessage()` which sets `content.textContent = message.content`.

Both paths rely on `white-space: pre-wrap` CSS to render `\n` characters as visible line breaks. This is purely visual — the `\n` lives in a text node, not in HTML structure. When the browser serializes the selection to HTML for the clipboard, the CSS is not included, so receiving apps collapse the whitespace.

## Goals / Non-Goals

**Goals:**
- Agent message newlines survive copy-paste into any app (Notion, Slack, Docs, terminal)
- No XSS risk — content is never passed through `innerHTML` unsanitized
- Both streamed and historical messages are consistent
- Empty lines are preserved (not collapsed)

**Non-Goals:**
- Markdown rendering (bold, headers, code blocks) — out of scope
- Changing how user messages are rendered
- Modifying the copy button behavior (it already writes `text/plain` via `navigator.clipboard.writeText`)

## Decisions

### Use per-line `<div>` wrapping, not `<br>` tags

**Decision**: Split text on `\n` and wrap each line in a `<div>`. Empty lines use `<div><br></div>`.

**Rationale**: Block elements (`<div>`) are the most universally respected HTML structure across paste targets. `<br>` works too, but browsers represent a single newline differently in the HTML clipboard across targets — some treat `<br>` as soft wrap, some as paragraph break. A `<div>` per line is unambiguous.

**Alternative considered**: `<br>` after each line. Rejected because empty `<br>`-only lines render with inconsistent spacing across rich text editors. `<div><br></div>` is the idiom browsers themselves use in `contentEditable` to represent empty lines.

### Two-phase approach for streaming: accumulate as text, convert on finalization

**Decision**: During streaming, keep appending to `responseEl.textContent` as-is. On `finalizeMessageStream()`, read the accumulated `textContent`, convert to line divs, and replace the content.

**Rationale**: Streaming chunks can split `\n` across boundaries. Converting mid-stream would require stateful tracking of partial newlines. The finalization step already exists for cleanup (cursor removal, class changes) — adding conversion there is natural. The visual experience during streaming is identical (pre-wrap still applies during the stream).

### Shared helper `renderTextAsLines(text, container)`

**Decision**: Extract the conversion logic into a single helper used by both render paths.

**Rationale**: The same conversion is needed in `finalizeMessageStream()` and `renderMessage()`. A shared helper avoids drift between the two paths.

```
renderTextAsLines(text, container):
  clear container
  split text by \n
  for each line:
    div = createElement('div')
    if line is empty:
      div.appendChild(createElement('br'))
    else:
      div.textContent = line   ← XSS safe
    container.appendChild(div)
```

### Remove `white-space: pre-wrap` from `.message-content`

**Decision**: Once content is rendered with block structure, the CSS `white-space: pre-wrap` on `.message-content` is no longer needed for agent messages.

**Caveat**: The `.editable-bubble .message-content[contenteditable]` rule also uses `white-space: pre-wrap` and must be kept — it is scoped separately and serves a different purpose (input field behavior).

## Risks / Trade-offs

- **Streaming visual flicker on finalization**: The conversion on `finalizeMessageStream()` replaces the DOM content, which could cause a brief reflow. Mitigation: the change is small (same text, just wrapped in divs) and happens at end-of-stream when the user is already reading, not during active streaming.
- **Copy button captures div structure**: `el.querySelector('.message-content').textContent` traverses all descendant `<div>` nodes. `.textContent` on a sequence of block divs concatenates their text without newlines in some browsers. Mitigation: update copy button to reconstruct text from line divs with `\n` joins.

## Open Questions

- Should the copy button explicitly join line div `textContent` values with `\n` to guarantee consistency, rather than relying on `textContent` traversal behavior?
