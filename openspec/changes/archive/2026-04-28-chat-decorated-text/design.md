## Architecture

All changes are in the frontend layer. No backend/API modifications needed.

```
renderMessage(msg)
  ├─ role === "assistant"
  │    ├─ header: [label] [meta] [👁 toggle] [📋 copy]
  │    ├─ default: renderDecoratedContent(text, container)
  │    └─ toggle → renderPlainContent(text, container)
  │
  └─ role === "user"
       └─ (unchanged) renderUserMessageContent(text, container)
```

## Decorated Renderer

`renderDecoratedContent(text, container)` processes text line-by-line. Block-level patterns (fenced code) are handled first, then inline patterns within each line.

### Block-level: Fenced Code Blocks

```
State machine while iterating lines:
  - See ```lang  → enter fence mode, emit fence-open div
  - In fence     → emit line inside <pre> block
  - See ```      → exit fence mode, emit fence-close div
```

The fence markers (` ``` `) and language tag remain visible inside the styled block.

### Inline patterns (applied per line, outside fences)

Processing order matters to avoid conflicts:

1. **Code spans**: `` `...` `` → `<code class="decorated-code">`...`</code>`
2. **Bold**: `**...**` or `__...__` → `<b class="decorated-bold">**...**</b>`
3. **Italic**: `*...*` or `_..._` → `<i class="decorated-italic">*...*</i>`
4. **Links**: `[text](url)` → `<a class="decorated-link" href="url">[text](url)</a>`

Inline patterns are applied via regex replacement on the HTML-escaped text of each line. Code span content is protected from further inline processing.

### File-ref detection

After inline decoration, each line still goes through the existing `splitTokenAffixes` / `isLikelyFileToken` logic to create `chat-file-ref` buttons. This runs on the text nodes within the decorated output.

## Plain Renderer

`renderPlainContent(text, container)` is a stripped-down version:
- Split by `\n`, create `<div>` per line
- `div.textContent = line` (no styling, no links, no file-ref buttons)
- Empty lines → `<br>`

This is simpler than the current `renderAgentMessageContent` which does file-ref detection.

## Toggle Button

- Icon: eye symbol (👁 or CSS-based icon)
- Class: `.view-toggle-btn`
- Styled identically to `.copy-btn`
- Placed immediately left of copy button in header
- Stores current mode in `dataset.viewMode` on the message element (`"decorated"` | `"plain"`)
- Click handler: reads `dataset.rawText`, calls appropriate renderer, updates icon state

### Toggle in streaming messages

During streaming, the toggle button is present but defaults to decorated. `updateMessageContent` appends chunks using decorated rendering. If user toggles to plain during streaming, the display switches to plain appending. On `finalizeMessageStream`, the content is re-rendered in whatever mode the toggle is set to.

## CSS Classes

```css
.view-toggle-btn        /* same style as .copy-btn */
.decorated-bold         /* font-weight: bold */
.decorated-italic       /* font-style: italic */
.decorated-code         /* font-family: monospace; background: #383838; padding: 1px 4px; border-radius: 3px */
.decorated-fence        /* background: #1e1e1e; border: 1px solid #444; border-radius: 4px; padding: 8px; margin: 4px 0; font-family: monospace; white-space: pre */
.decorated-link         /* color: #74c0fc; text-decoration: underline; cursor: pointer */
.view-toggle-btn.active /* slightly brighter color to indicate decorated mode is on */
```

## Decisions

1. **No marked.js** — The decorated renderer is a lightweight regex-based pass, not a full markdown parser. `marked.min.js` remains unused by this feature.
2. **Inline regex order** — Code spans first to protect their content, then bold (greedy `**`), then italic (`*`), then links. This avoids `*` inside code spans being treated as italic.
3. **XSS safety** — Text is HTML-escaped before regex decoration. Links use `href` with the raw URL from the markdown syntax; `target="_blank"` and `rel="noopener"` are set for safety.
4. **Streaming** — Decorated rendering works chunk-by-chunk since it's line-based, same as current plain rendering. No need to wait for message completion.
