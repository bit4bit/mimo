## 1. Streaming Accumulated Text Source

- [x] 1.1 Modify `updateMessageContent(text)` in `chat.js` to append `text` to `ChatState.streaming.content` instead of `responseEl.textContent += text`
- [x] 1.2 Add `ChatState.streaming.renderTimer` (null by default) to track pending throttle timer
- [x] 1.3 Add `ChatState.streaming.lastRenderLength` (0 by default) to detect when content has changed since last render

## 2. Throttled Decorated Render

- [x] 2.1 Create `scheduleStreamingRender()` function: if `renderTimer` is not null, return; set `renderTimer` to `setTimeout(streamingRenderTick, throttleInterval)`
- [x] 2.2 Create `streamingRenderTick()`: set `renderTimer = null`, read `ChatState.streaming.content`, call `renderDecoratedContent(content, responseEl)` if viewMode is "decorated", append typing cursor, scroll to bottom
- [x] 2.3 Compute throttle interval: if `ChatState.streaming.content.length > 50000` use 500ms, else 150ms
- [x] 2.4 Update `updateMessageContent(text)` to call `scheduleStreamingRender()` after appending to `ChatState.streaming.content`
- [x] 2.5 Handle plain mode during streaming: if `dataset.viewMode === "plain"`, skip `scheduleStreamingRender` and fall back to `responseEl.textContent += text`

## 3. Streaming Cursor Management

- [x] 3.1 Remove cursor before each throttled re-render in `streamingRenderTick` (query and remove `.typing-cursor` before calling `renderDecoratedContent`)
- [x] 3.2 Append cursor after each throttled re-render in `streamingRenderTick`
- [x] 3.3 Verify `finalizeMessageStream` still removes cursor before final render (already exists)

## 4. Toggle During Streaming

- [x] 4.1 When toggling decorated → plain during streaming: call `renderPlainContent(accumulated, responseEl)`, set viewMode to "plain", cancel pending `renderTimer` (clearTimeout + set null)
- [x] 4.2 When toggling plain → decorated during streaming: call `renderDecoratedContent(accumulated, responseEl)`, set viewMode to "decorated", resume by calling `scheduleStreamingRender()`
- [x] 4.3 Verify toggle button click handler in `insertStreamingMessage` handles both transitions

## 5. Finalization Consistency

- [x] 5.1 Update `finalizeMessageStream`: cancel any pending `renderTimer`, clear `ChatState.streaming.renderTimer`
- [x] 5.2 Verify `finalizeMessageStream` reads accumulated text from `ChatState.streaming.content` (not from `responseEl.textContent`)
- [x] 5.3 Verify no visual jump: since decorated content was already rendered during streaming, the final `renderDecoratedContent` call produces the same DOM

## 6. Syntax Highlighting for Fenced Code Blocks

- [x] 6.1 Modify `renderDecoratedContent` in `chat.js`: after creating a `.decorated-fence` element, extract language tag from first line of `token.lines` (regex: `/^```(\w+)/`)
- [x] 6.2 If language tag is present, call `hljs.highlightElement(fenceDiv)` or `hljs.highlightAuto(fenceDiv.textContent)` on the fence element
- [x] 6.3 If no language tag, skip highlighting (existing monospace CSS still applies)
- [x] 6.4 Add `.decorated-fence code` CSS rule in SessionDetailPage.tsx if needed for highlight.js output styling (override background to match dark theme)

## 7. Tests

- [x] 7.1 Write integration test: streaming message_chunk events produce decorated content visible during streaming (paragraph gaps, code fences, bold/italic styling)
- [x] 7.2 Write integration test: toggle between decorated and plain during streaming preserves content and switches rendering mode
- [x] 7.3 Write integration test: throttle batches rapid chunks into single re-render
- [x] 7.4 Write integration test: syntax highlighting is applied to fenced code blocks with language tags
- [x] 7.5 Write integration test: large message (>50000 chars) increases throttle interval
- [x] 7.6 Verify existing tests pass (loadChatHistory, insertMessage, finalizeMessageStream, toggle behavior)