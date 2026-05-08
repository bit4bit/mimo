## Tasks

### 1. Add CSS for decorated elements and toggle button

- [x] Add `.view-toggle-btn` styles (same as `.copy-btn`) in `SessionDetailPage.tsx`
- [x] Add `.view-toggle-btn.active` style (brighter color when decorated is on)
- [x] Add `.decorated-bold` style
- [x] Add `.decorated-italic` style
- [x] Add `.decorated-code` style (monospace, background, padding, border-radius)
- [x] Add `.decorated-fence` style (dark background, border, monospace, pre-wrap)
- [x] Add `.decorated-link` style (colored, underline, cursor pointer)

### 2. Implement plain renderer

- [x] Create `renderPlainContent(text, container)` in chat.js — split by `\n`, `textContent` per line, `<br>` for empty lines, no file-refs, no styling

### 3. Implement decorated renderer

- [x] Create `renderDecoratedContent(text, container)` in chat.js
- [x] Implement fenced code block detection (state machine over lines)
- [x] Implement inline code span decoration (`` `...` `` → `<code>`)
- [x] Implement bold decoration (`**...**` / `__...__` → `<b>`)
- [x] Implement italic decoration (`*...*` / `_..._` → `<i>`)
- [x] Implement link decoration (`[text](url)` → `<a>` clickable, full syntax visible)
- [x] Preserve file-ref auto-detection on text nodes within decorated lines
- [x] HTML-escape text before applying regex decorations (XSS safety)

### 4. Add toggle button to renderMessage

- [x] Create eye icon toggle button in `renderMessage` header (before copy button), only for assistant role
- [x] Set `dataset.viewMode = "decorated"` on message element
- [x] Default rendering calls `renderDecoratedContent` instead of `renderAgentMessageContent`

### 5. Add toggle button to renderStreamingMessage

- [x] Create eye icon toggle button in streaming message header (before copy button)
- [x] Set `dataset.viewMode = "decorated"` on streaming element

### 6. Wire toggle event handlers

- [x] In message load flow (where copy handler is attached ~line 1987): attach toggle click handler that reads `dataset.rawText`, calls `renderDecoratedContent` or `renderPlainContent`, updates `dataset.viewMode` and button visual state
- [x] In `insertStreamingMessage` (~line 2156): attach same toggle handler
- [x] On toggle during streaming: switch rendering mode for subsequent chunks

### 7. Update finalizeMessageStream

- [x] In `finalizeMessageStream` (~line 2253): re-render content respecting current `dataset.viewMode` (decorated or plain)

### 8. Tests

- [x] Test `renderDecoratedContent` produces correct HTML for bold, italic, code, fenced blocks, links
- [x] Test `renderPlainContent` produces raw text with no styling
- [x] Test toggle switches between modes and re-renders correctly
- [x] Test file-ref buttons appear in decorated mode but not in plain mode
- [x] Test unclosed markers are treated as literal text
- [x] Test XSS: angle brackets in message text are escaped
