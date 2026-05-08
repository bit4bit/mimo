## Why

Agent messages contain markdown syntax (`**bold**`, `` `code` ``, fenced blocks, links) but the chat UI renders everything as plain text. Users can't visually distinguish structure in long responses. At the same time, full markdown rendering hides the raw syntax — which is useful for copy-paste and debugging. We need a "decorated" mode that applies visual styling while keeping markdown markers visible, plus a plain mode for raw inspection.

## What Changes

- **chat.js**: New `renderDecoratedContent(text, container)` function that applies inline styling while preserving markdown syntax characters:
  - `**bold**` → bold text with `**` visible
  - `*italic*` → italic text with `*` visible
  - `` `code` `` → monospace+bg with backticks visible
  - Fenced code blocks → dark box with fence markers and lang visible
  - `[text](url)` → full syntax visible, entire thing clickable
  - File-ref auto-detection preserved (existing `chat-file-ref` buttons)

- **chat.js**: New per-message toggle button (eye icon) next to copy button in message header. Toggles between Decorated (default) and Plain modes.

- **chat.js**: `renderAgentMessageContent` becomes the Plain renderer. New `renderDecoratedContent` is the Decorated renderer. Toggle re-renders using `dataset.rawText`.

- **SessionDetailPage.tsx**: CSS for decorated inline styles (`.decorated-bold`, `.decorated-italic`, `.decorated-code`, `.decorated-fence-block`, `.decorated-link`) and toggle button (`.view-toggle-btn`).

- **Only agent (assistant) messages** get the toggle and decorated rendering. User messages remain as-is.

## Capabilities

### New Capabilities

- `decorated-text-rendering`: Render agent message content with visual markdown styling while keeping syntax markers visible, with per-message toggle to plain text view.

### Modified Capabilities

- _(none)_

## Impact

- **chat.js**: New decorated renderer function, toggle button in `renderMessage` and `renderStreamingMessage` headers, toggle event handlers in `insertStreamingMessage` and message load flow, update `finalizeMessageStream` to preserve toggle state.
- **SessionDetailPage.tsx**: New CSS classes for decorated elements and toggle button.
- **No backend changes** — purely frontend rendering.
