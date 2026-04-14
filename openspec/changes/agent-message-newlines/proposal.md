## Why

Agent message content is rendered using CSS `white-space: pre-wrap` with literal `\n` characters in text nodes. This works visually, but when users copy and paste into other apps (Notion, Slack, Docs), the HTML clipboard format loses newlines because the CSS is not carried along — resulting in all lines collapsed into a single run of text.

## What Changes

- **chat.js**: Replace `white-space: pre-wrap` + raw text rendering with per-line `<div>` wrapping for agent message content. Empty lines use `<div><br></div>` to preserve height.
- **chat.js**: Add a `renderTextAsLines(text, container)` helper used in both streaming finalization and history reconstruction.
- **chat.js**: Apply conversion on `finalizeMessageStream()` (streamed messages) and in `renderMessage()` / `renderChatHistory()` (historical messages).
- **SessionDetailPage.tsx**: Remove `white-space: pre-wrap` from `.message-content` CSS (no longer needed once block structure handles line breaks).

## Capabilities

### New Capabilities
- `agent-message-rendering`: How agent message content is rendered into the DOM — newline preservation, copy-paste fidelity, and clipboard format behavior.

### Modified Capabilities

## Impact

- `packages/mimo-platform/public/js/chat.js` — rendering logic for agent messages
- `packages/mimo-platform/src/components/SessionDetailPage.tsx` — CSS for `.message-content`
