## Why

Agent message boxes can only show "decorated" (custom inline markup) or "plain" (raw text) views. Neither renders real markdown — tables, nested lists, blockquotes, and headings from agent output appear as literal syntax. The `marked` library is already vendored (used by help tooltips) but unused in chat, so users have no way to read structured agent output as it was intended.

## What Changes

- Add a third per-message view mode, **markdown**, to the assistant message box toggle.
- Extend the toggle cycle from 2-way to 3-way: `decorated → plain → markdown → decorated`.
- New `renderMarkdownContent(rawText, contentEl)` renders the message's `dataset.rawText` via `marked.parse()` into `message-content` `innerHTML`.
- Toggle button title/icon reflects the current mode across all three states.
- Add chat CSS so markdown elements (tables, lists, blockquotes, headings, code blocks) render legibly inside `.message-content`.
- **SECURITY (accepted risk):** markdown output is assigned to `innerHTML` **without HTML sanitization** (no DOMPurify). Agent output is treated as trusted-enough for this product. If agent output ever echoes hostile HTML (`<script>`, `<img onerror=...>` from a file/web/tool result), it will execute. This is a deliberate, documented trade-off chosen for simplicity over an added sanitizer dependency.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `decorated-text-rendering`: the per-message view toggle gains a third mode (markdown) and cycles through three states instead of two; adds a markdown rendering behavior backed by `marked`.

## Impact

- `packages/mimo-platform/public/js/chat.js` — toggle button creation (~line 160), toggle click handler (~line 2475), new `renderMarkdownContent` near `renderPlainContent`.
- Chat CSS (markdown element styling within `.message-content`).
- Reuses already-vendored `marked` (`Layout.tsx` `<script>`, embedded via `assets.ts`); no new dependency.
- Tests added near `packages/mimo-platform/test/frontend/js/chat-decorated-utils.test.ts`.
- No backend, API, or data changes.
