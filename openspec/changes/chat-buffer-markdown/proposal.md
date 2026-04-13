# Proposal: Chat Buffer Markdown Rendering with Raw/Markdown Toggle

## Summary
Enhance the chat buffer to render agent messages as formatted markdown after streaming completes, while providing users the ability to toggle between rendered markdown and raw markdown source.

## Motivation
Currently, agent messages in the chat buffer are displayed as plain text with `white-space: pre-wrap`. This makes reading formatted responses (with code blocks, headers, lists, etc.) difficult. Users want to see rendered markdown for better readability, but also need access to the raw markdown source for copying or debugging.

## Goals
1. Render agent messages as formatted markdown once streaming completes
2. Provide a toggle to switch between rendered view and raw markdown view
3. Maintain the current streaming behavior (plain text during stream)
4. Keep the toggle per-message (not global)

## Non-Goals
- Real-time markdown rendering during streaming (too complex, partial markdown breaks)
- Server-side markdown rendering (keep implementation simple, client-side only)
- Affect user messages (only agent messages need markdown rendering)

## Proposed Solution

### Streaming Phase (Unchanged)
- Agent messages stream character-by-character as plain text
- Current `textContent += text` behavior remains
- Users see content building up in real-time

### Post-Stream Phase (New)
When `finalizeMessageStream` is called:
1. Store the complete raw markdown in `data-raw-content` attribute
2. Render the markdown to HTML using a lightweight client-side library
3. Replace content with rendered HTML using `innerHTML`
4. Add toggle buttons: [Raw] [Markdown] in the message header
5. Default to rendered markdown view

### Toggle Behavior
- Clicking [Raw] switches to plain text view (shows `data-raw-content`)
- Clicking [Markdown] switches back to rendered HTML
- Active button has visual indication (highlighted/pressed state)
- Toggle state is per-message

## Technical Approach
1. **Client-side markdown library**: Use `marked` (lightweight, popular, supports code blocks with syntax highlighting)
2. **Modify chat.js**:
   - Add `marked` to the project dependencies
   - Modify `finalizeMessageStream()` to render markdown and add toggle
   - Modify `renderMessage()` for non-streaming messages to also support toggle
   - Add CSS for rendered markdown styles
3. **Update SessionDetailPage.tsx**: Add CSS styles for markdown rendering and toggle buttons

## Success Criteria
- [ ] Agent messages render as formatted markdown after streaming ends
- [ ] Toggle buttons allow switching between raw and rendered views
- [ ] Raw view shows exact markdown source
- [ ] Markdown view properly renders headers, lists, code blocks, links
- [ ] User messages remain unaffected
- [ ] No visual glitches during streaming
