## Context

Agent response content streams to the browser as `message_chunk` WebSocket events. Today, `updateMessageContent(text)` in `chat.js` appends each chunk to a single text node via `responseEl.textContent += text`. The `.message-content` container has `white-space: pre-wrap`, so the raw text preserves line breaks but has zero visual differentiation — no paragraph gaps, no bold/italic styling, no code fence rendering. The user sees raw markdown syntax until `finalizeMessageStream` calls `renderDecoratedContent` once, causing a jarring visual jump.

The `renderDecoratedContent` function is already idempotent (clears container, rebuilds from text), making it safe to call repeatedly during streaming. Highlight.js is loaded but only used for the file viewer buffer.

## Goals / Non-Goals

**Goals:**
- Show decorated content (bold, italic, code, fences, headings, paragraph gaps) during streaming, not just after finalization
- Eliminate the visual jump between streaming (raw text) and finalized (decorated) states
- Add syntax highlighting to fenced code blocks using the already-loaded highlight.js
- Preserve toggle button functionality during streaming
- Keep the existing decorated/plain toggle system unchanged for finalized messages

**Non-Goals:**
- Replacing the decorated-text renderer with a full markdown renderer (marked.js)
- Changing server-side streaming pipeline or WebSocket protocol
- Rendering lists (`- item`, `1. item`) with proper `<ul>`/`<ol>` semantics
- Rendering thought section content with decorations during streaming

## Decisions

### D1: Throttled re-render via `renderDecoratedContent` during streaming

On each `message_chunk`, accumulate text in `ChatState.streaming.content` and schedule a throttled re-render (~150ms) that calls `renderDecoratedContent(accumulated, responseEl)`.

**Alternative considered**: Re-render on every chunk. Rejected because rapid micro-chunks (common with some providers) would cause excessive DOM churn. 150ms is fast enough to feel live (~6-7 fps) while batching rapid chunks.

**Alternative considered**: Render only on paragraph/fence boundaries. Rejected because it requires lookahead parsing on a partial stream and adds complexity for marginal gain.

### D2: Accumulate text in state, not read from DOM

Store the accumulated message text in `ChatState.streaming.content` (string). On render, pass this string to `renderDecoratedContent`. Do not read `responseEl.textContent` back — that would lose the distinction between rendered and raw content.

This is already partially in place: `ChatState.streaming.content` exists but is only used for reconstruction. We promote it to the single source of truth for streaming message text.

### D3: Append typing cursor after each re-render

After each `renderDecoratedContent` call during streaming, create and append a typing cursor `<span class="typing-cursor">` as the last child of `responseEl`. This replaces the current approach of appending the cursor after `textContent +=`.

### D4: Syntax-highlight fenced code blocks

After `renderDecoratedContent` builds a `.decorated-fence` element, detect the language tag from the opening fence line (e.g., `` ```typescript ``) and call `hljs.highlightElement()` on each fence's code content. This applies during both streaming and finalization.

**Language detection**: Extract the language identifier from the first line of the fence token's `lines` array. Map to highlight.js language names. If no language tag or unrecognized, skip highlighting (monospace display still applies via CSS).

### D5: Toggle button during streaming

The toggle button remains functional. When toggled during streaming:
- **Decorated → Plain**: Call `renderPlainContent(accumulated, responseEl)`, set `dataset.viewMode = "plain"`, stop scheduling decorated re-renders, fall back to `textContent +=` for new chunks
- **Plain → Decorated**: Call `renderDecoratedContent(accumulated, responseEl)`, set `dataset.viewMode = "decorated"`, resume throttled re-rendering

On finalization, re-render in the current viewMode (already the case today).

## Risks / Trade-offs

- **[Performance on very long messages]** Re-rendering the full DOM on each 150ms tick could get slow for messages exceeding ~10K lines. → Mitigation: If `accumulated.length > 50000`, increase throttle to 500ms or skip intermediate renders and only render on finalization.
- **[Flicker during re-render]** Clearing and rebuilding the DOM could cause brief flicker. → Mitigation: `renderDecoratedContent` sets `container.textContent = ""` then appends synchronously; browsers batch synchronous DOM mutations within a single frame, so flicker is unlikely.
- **[Unclosed fences during streaming]** A fence may be opened but not yet closed while streaming. `buildDecoratedLines` already handles this — unclosed fences emit lines as `plain` tokens until the closing fence arrives. → No mitigation needed.
- **[highlight.js load cost]** `hljs.highlightElement` is synchronous and can be slow for large code blocks. → Mitigation: Only highlight fences with a recognized language tag. Skip highlighting during streaming if fence content exceeds 100 lines; apply highlighting only on finalization for large blocks.