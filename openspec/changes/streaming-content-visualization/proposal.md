## Why

During streaming, agent response content renders as one undifferentiated wall of text. Chunks are appended via `textContent +=` with no paragraph separation, no bold/italic/code styling, no fenced code blocks, and no syntax highlighting. The user sees raw markdown syntax for the entire duration of the response, only getting proper visual formatting when `finalizeMessageStream` fires. For long responses, this is most of what the user sees.

## What Changes

- Streaming message content is incrementally rendered through `renderDecoratedContent` (the same function used on finalization) on a throttled basis as chunks arrive, instead of dumping raw text via `textContent +=`
- A throttled render scheduler (~150ms) accumulates chunks and re-renders the decorated view, so the user sees paragraph gaps, bold/italic/code styling, and fenced blocks while content is still arriving
- The typing cursor is appended after each re-render so the user can see where content is arriving
- Code fences receive syntax highlighting via highlight.js (already loaded) during both streaming and finalization
- On finalization, the same `renderDecoratedContent` runs — no visual jump between streaming and finalized states
- The toggle button remains functional during streaming, switching between decorated and plain views of the accumulated content

## Capabilities

### New Capabilities
- `streaming-content-rendering`: Incremental decorated rendering of agent message content during streaming, including throttled re-render, syntax-highlighted code fences, and cursor positioning

### Modified Capabilities
- `decorated-text-rendering`: Adds syntax highlighting to fenced code blocks and clarifies streaming behavior (incremental decorated render replaces raw text dump)

## Impact

- `public/js/chat.js`: `updateMessageContent`, `finalizeMessageStream`, streaming state management, toggle handler during streaming
- `public/js/chat-decorated-utils.js`: No changes (rendering functions unchanged)
- `public/vendor/highlight/`: Already loaded; `highlightBlock` called on fence elements
- `src/web/features/sessions/components/SessionDetailPage.tsx`: CSS for `.decorated-fence` code highlighting if needed