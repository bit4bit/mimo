## ADDED Requirements

### Requirement: Heading token detection
`buildDecoratedLines()` SHALL detect lines matching `^#{1,6}\s+\S` and emit a `heading` token instead of a `plain` or `decorated` token. The token SHALL carry: `type: "heading"`, `level` (integer 1–6 matching the number of `#` characters), `text` (the raw original line), and `html` (the heading content after stripping `#{level} `, HTML-escaped, with `decorateInlineMarkup()` applied).

#### Scenario: Single-hash heading detected
- **WHEN** `buildDecoratedLines()` processes `"# Introduction"`
- **THEN** it returns a token `{type: "heading", level: 1, text: "# Introduction", html: "Introduction"}`

#### Scenario: Double-hash heading detected
- **WHEN** `buildDecoratedLines()` processes `"## Summary"`
- **THEN** it returns a token `{type: "heading", level: 2, text: "## Summary", html: "Summary"}`

#### Scenario: Six-hash heading detected
- **WHEN** `buildDecoratedLines()` processes `"###### Note"`
- **THEN** it returns a token `{type: "heading", level: 6, text: "###### Note", html: "Note"}`

#### Scenario: Hashtag without space is not a heading
- **WHEN** `buildDecoratedLines()` processes `"#hashtag"`
- **THEN** it returns a `plain` or `decorated` token, NOT a `heading` token

#### Scenario: Bare hash is not a heading
- **WHEN** `buildDecoratedLines()` processes `"#"`
- **THEN** it returns a `plain` token, NOT a `heading` token

### Requirement: Inline markup inside headings
`buildDecoratedLines()` SHALL apply `decorateInlineMarkup()` to heading content so that inline markdown (bold, italic, code spans, links) inside a heading is decorated.

#### Scenario: Bold inside heading
- **WHEN** `buildDecoratedLines()` processes `"## **Critical** section"`
- **THEN** the heading token's `html` field contains `<b class="decorated-bold">**Critical**</b> section`

#### Scenario: Code span inside heading
- **WHEN** `buildDecoratedLines()` processes `"### Use \`npm install\`"`
- **THEN** the heading token's `html` field contains `<code class="decorated-code">` with backticks visible

### Requirement: Heading DOM rendering
`renderDecoratedContent()` in `chat.js` SHALL render `heading` tokens as real HTML heading elements. A markdown level of N SHALL produce an `<h{N+1}>` element (so `#` → `<h2>`, `##` → `<h3>`, ..., `######` → `<h6>`). The element SHALL have both `decorated-heading` and `decorated-heading-{N}` CSS classes (where N is the markdown level 1–5; level 6 uses `decorated-heading` only).

#### Scenario: Level-1 heading renders as h2
- **WHEN** `renderDecoratedContent()` processes a `{type: "heading", level: 1, html: "Introduction"}` token
- **THEN** it creates an `<h2>` element with class `decorated-heading decorated-heading-1` and innerHTML `"Introduction"`

#### Scenario: Level-3 heading renders as h4
- **WHEN** `renderDecoratedContent()` processes a `{type: "heading", level: 3, html: "Details"}` token
- **THEN** it creates an `<h4>` element with class `decorated-heading decorated-heading-3` and innerHTML `"Details"`

#### Scenario: Level-6 heading renders as h6
- **WHEN** `renderDecoratedContent()` processes a `{type: "heading", level: 6, html: "Note"}` token
- **THEN** it creates an `<h6>` element with class `decorated-heading` (no level suffix) and innerHTML `"Note"`

### Requirement: Plain mode preserves raw heading syntax
In plain mode, heading lines SHALL be displayed as raw text including the `#` markers. No special handling is needed — the existing plain renderer uses the raw `text` field which retains the original line.

#### Scenario: Plain mode shows hash markers
- **WHEN** a message containing `"# Introduction"` is rendered in plain mode
- **THEN** the displayed text is `"# Introduction"` with no styling applied

### Requirement: XSS safety in headings
Heading content SHALL be HTML-escaped before any decoration is applied. User-controlled `<`, `>`, `"`, `&` characters in heading text SHALL be rendered as HTML entities.

#### Scenario: Script tag in heading is escaped
- **WHEN** `buildDecoratedLines()` processes `"# <script>alert(1)</script>"`
- **THEN** the heading token's `html` field contains `&lt;script&gt;alert(1)&lt;/script&gt;` and no script executes

### Requirement: Heading CSS styles
`SessionDetailPage.tsx` SHALL define `.decorated-heading` (base: margin reset, line-height) and `.decorated-heading-1` through `.decorated-heading-5` (font-size scale: 1.5em, 1.3em, 1.15em, 1.05em, 1.0em). All heading levels SHALL render bold.

#### Scenario: Heading size decreases with level
- **WHEN** a level-1 heading and a level-3 heading are rendered side by side
- **THEN** the level-1 heading appears visually larger than the level-3 heading
