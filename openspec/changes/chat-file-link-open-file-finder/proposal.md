## Why

Users often reference files directly in chat prompts (for example `src/routes.ts` or `./README.md`). Today those references are plain text, so opening the file still requires a separate manual file-finder action. This slows down prompt refinement and context switching.

## What Changes

- Render likely file references in agent (assistant) chat messages as clickable tokens
- Clicking a token opens the existing file finder dialog with the token prefilled and selected
- Upgrade file-finder matching to prioritize path matches (absolute/relative) before filename-only matches
- Keep existing file-finder open/select workflow unchanged after results render

## Capabilities

### New Capabilities

- `chat-file-link-open-file-finder`: Open file finder from file-like tokens inside user chat messages

### Modified Capabilities

- `file-finder-search-priority`: Search ordering now prioritizes path matches before filename fallback

## Impact

- `packages/mimo-platform/public/js/chat.js`: render file-like tokens and wire click-to-open behavior
- `packages/mimo-platform/public/js/edit-buffer.js`: support prefilled finder opening and ordered path-first filtering
- `packages/mimo-platform/src/files/service.ts`: add path-first search ranking for API-driven matching
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`: style clickable file tokens in chat
- `packages/mimo-platform/test/files-service.test.ts`: add behavior tests for path-priority and absolute/relative query matching
