## 1. Verify prerequisites

- [x] 1.1 Confirm vendored `public/vendor/marked.min.js` exposes global `marked.parse` and renders GFM tables (add `{ gfm: true }` if not on by default)
- [x] 1.2 Confirm `marked` is loaded on the chat page via `Layout.tsx` and embedded via `assets.ts`

## 2. Tests first (BDD/TDD)

- [x] 2.1 Add failing test for `renderMarkdownContent`: markdown table source → `.message-content` contains `<table>` with rows/cells
- [x] 2.2 Add failing test: markdown list source → `<ul>`/`<ol>` with `<li>` items
- [x] 2.3 Add failing test: `renderMarkdownContent` sources from `dataset.rawText`
- [x] 2.4 Add failing test: `marked` undefined → falls back to plain rendering (no blank box)
- [x] 2.5 Add failing test for 3-way cycle: decorated → plain → markdown → decorated, asserting `dataset.viewMode` per click
- [x] 2.6 Add failing test: toggle is per-message (one message's mode change does not affect others)
- [x] 2.7 Add failing test: toggle button `title` reflects current mode in each of the three states

## 3. Implementation

- [x] 3.1 Add `renderMarkdownContent(rawText, contentEl)` near `renderPlainContent` in `chat.js`; assign `marked.parse(rawText)` to `innerHTML`; fall back to `renderPlainContent` when `marked` is undefined
- [x] 3.2 Update toggle button creation (`chat.js` ~line 160): set initial `title` for decorated; keep default `dataset.viewMode = "decorated"`
- [x] 3.3 Replace the 2-way if/else toggle handler (`chat.js` ~line 2475) with a 3-way cycle advancing decorated → plain → markdown → decorated, re-rendering from `dataset.rawText` and updating button `title`/indicator
- [x] 3.4 Add CSS scoped to `.message-content` for `table/th/td`, `ul/ol/li`, `blockquote`, `h1`–`h6`, `pre/code` so markdown renders legibly

## 4. Verify

- [x] 4.1 Run `cd packages/mimo-platform && bun test` — all new and existing frontend tests pass
- [ ] 4.2 Manual check (with user approval to run app, if needed): cycle a message through all three modes; confirm a table-containing agent message renders a styled table in markdown mode
