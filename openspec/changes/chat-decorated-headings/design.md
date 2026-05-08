## Context

The chat decoration system (`chat-decorated-utils.js`) processes agent message text line-by-line and returns a token array consumed by `renderDecoratedContent()` in `chat.js`. The existing token types are `fence`, `empty`, `plain`, and `decorated`. Inline patterns (bold, italic, code, links) are handled by `decorateInlineMarkup()` which operates on a single escaped line.

The `chat-decorated-text` change is fully shipped. This change adds a new token type for headings without modifying any existing token behavior.

## Goals / Non-Goals

**Goals:**

- Detect `#{1,6}` heading lines in `buildDecoratedLines()` and emit a `heading` token
- Render heading tokens as `<h2>`–`<h6>` in `renderDecoratedContent()`
- Apply `decorateInlineMarkup()` to heading content (inline markup works inside headings)
- Hide `#` markers in decorated mode; raw line visible in plain mode (no change needed — plain mode uses `text` field)
- Add CSS scale for heading levels

**Non-Goals:**

- Lists, blockquotes, tables, or any other block-level markdown
- Setext-style headings (`===` / `---` underlines)
- Heading anchors or IDs
- Nested headings or heading numbering

## Decisions

### 1. `#` maps to `<h2>`, not `<h1>`

`<h1>` is reserved for the page title. In a chat context, agent-generated headings are section markers within a message, not page-level headings. Using `<h2>`–`<h6>` avoids semantic conflicts with the surrounding page structure.

Alternative considered: `<h1>`–`<h6>`. Rejected — breaks page heading hierarchy.
Alternative considered: `<div class="decorated-heading-N">` with CSS-only sizing. Rejected — real heading tags are accessible and semantically correct for section structure.

### 2. New `heading` token type in `buildDecoratedLines()`

Detection lives in the utility layer (not the renderer) so it stays testable without DOM. The token carries:

- `type: "heading"`
- `level`: integer 1–6 (markdown level, not HTML level — the renderer does `level + 1` for the HTML tag)
- `text`: raw original line (for plain mode)
- `html`: `decorateInlineMarkup(escapeHtml(content))` where `content` is the text after stripping `#{level} `

The heading detection runs after fence detection, same position as other line-level patterns.

Alternative considered: detect headings inside `decorateInlineMarkup()`. Rejected — headings are block-level; mixing them into the inline pass would complicate the protect/restore logic.

### 3. CSS class naming: `.decorated-heading` + `.decorated-heading-N`

Consistent with existing `.decorated-bold`, `.decorated-italic`, `.decorated-code`, `.decorated-fence` naming. `.decorated-heading` carries shared base styles (margin, line-height reset); `.decorated-heading-N` (N = 1–5, matching markdown levels 1–5; level 6 falls back to base) carries size.

Size scale (relative to chat body text):

```
level 1 (#)   → 1.5em
level 2 (##)  → 1.3em
level 3 (###) → 1.15em
level 4 (####) → 1.05em
level 5 (#####) → 1.0em bold
level 6 (######) → 0.95em bold (uses .decorated-heading only)
```

## Risks / Trade-offs

- **CSS bleed from global heading resets**: If the platform has `h2, h3 { margin: 0 }` or similar resets, heading margins may collapse unexpectedly. Mitigation: `.decorated-heading` sets explicit `margin` and `line-height` to override any resets.
- **Streaming**: Heading lines are single-line constructs — no multi-line accumulation needed. Works identically to existing plain/decorated lines during streaming.
- **Inline markup edge cases**: `## **bold** _italic_` should work. `decorateInlineMarkup()` already handles this correctly; no special casing needed.
- **False positives**: `#hashtag` (no space after `#`) must not trigger heading detection. The regex `^#{1,6}\s+\S` requires at least one whitespace and one non-whitespace character after the markers — this excludes bare `#` or `#hashtag`.
