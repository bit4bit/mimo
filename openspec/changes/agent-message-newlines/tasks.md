## 1. Test First

- [x] 1.1 Write a failing integration test: agent message with `\n` renders as separate `<div>` elements in the DOM
- [x] 1.2 Write a failing integration test: empty line (`\n\n`) renders as `<div><br></div>`
- [x] 1.3 Write a failing integration test: copy button produces plain text with `\n` between lines (no thought section bleed-through)

## 2. Core Helper

- [x] 2.1 Add `renderTextAsLines(text, container)` helper in `chat.js` — splits text on `\n`, wraps each line in a `<div>`, uses `<div><br></div>` for empty lines

## 3. Streaming Path

- [x] 3.1 Update `finalizeMessageStream()` to call `renderTextAsLines` on the accumulated `textContent` of `div.message-response`

## 4. History Path

- [x] 4.1 Update `renderMessage()` to use `renderTextAsLines` instead of `content.textContent = message.content`

## 5. Copy Button Fix

- [x] 5.1 Update copy button handler in both `insertMessage()` and `insertStreamingMessage()` to join line-div `textContent` values with `\n` (instead of relying on `.message-content.textContent` traversal)

## 6. CSS Cleanup

- [x] 6.1 Restored `white-space: pre-wrap` on `.message-content` — needed during streaming so partial content renders correctly; per-line divs fix clipboard without removing it

## 7. Verify

- [x] 7.1 Run all tests — confirm new tests pass and no regressions
- [ ] 7.2 Manual smoke test: send a multi-line agent response, copy it, paste into a rich text editor and verify newlines are preserved
