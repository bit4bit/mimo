## 1. Tests (write first)

- [ ] 1.1 Add test: `buildDecoratedLines("# Introduction")` returns `{type:"heading", level:1, text:"# Introduction", html:"Introduction"}`
- [ ] 1.2 Add test: `##` through `######` produce correct `level` values (2–6)
- [ ] 1.3 Add test: `#hashtag` (no space) does NOT produce a heading token
- [ ] 1.4 Add test: bare `#` does NOT produce a heading token
- [ ] 1.5 Add test: inline bold inside heading — `## **Bold**` produces `html` with `<b class="decorated-bold">**Bold**</b>`
- [ ] 1.6 Add test: inline code span inside heading — `### \`code\``produces`html`with`<code class="decorated-code">`
- [ ] 1.7 Add test: XSS — `# <script>alert(1)</script>` produces escaped html with no `<script>` tag
- [ ] 1.8 Confirm all new tests fail (red) before implementation

## 2. Token detection in chat-decorated-utils.js

- [ ] 2.1 In `buildDecoratedLines()`, add heading detection after fence-exit, before the `line === ""` check: regex `^(#{1,6})\s+(\S.*)$`
- [ ] 2.2 Extract `level = match[1].length` and `content = match[2]`
- [ ] 2.3 Emit `{type: "heading", level, text: line, html: decorateInlineMarkup(escapeHtml(content))}`
- [ ] 2.4 Run tests — all heading detection tests should pass

## 3. DOM rendering in chat.js

- [ ] 3.1 In `renderDecoratedContent()`, add a branch for `token.type === "heading"`
- [ ] 3.2 Create element: `document.createElement("h" + (token.level + 1))` (capped at 6)
- [ ] 3.3 Add classes: `decorated-heading` always; `decorated-heading-{level}` for levels 1–5
- [ ] 3.4 Set `el.innerHTML = token.html`
- [ ] 3.5 Append element to container (same pattern as fence block rendering)

## 4. CSS in SessionDetailPage.tsx

- [ ] 4.1 Add `.decorated-heading` base style: `font-weight: bold; margin: 0.5em 0 0.25em; line-height: 1.3`
- [ ] 4.2 Add `.decorated-heading-1`: `font-size: 1.5em`
- [ ] 4.3 Add `.decorated-heading-2`: `font-size: 1.3em`
- [ ] 4.4 Add `.decorated-heading-3`: `font-size: 1.15em`
- [ ] 4.5 Add `.decorated-heading-4`: `font-size: 1.05em`
- [ ] 4.6 Add `.decorated-heading-5`: `font-size: 1.0em`

## 5. Verify

- [ ] 5.1 Run `cd packages/mimo-platform && bun test` — all tests pass
- [ ] 5.2 Confirm `#hashtag` and bare `#` still render as plain text in a manual review of test output
