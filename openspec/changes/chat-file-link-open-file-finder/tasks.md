## 1. Path-priority matching

- [x] 1.1 Add ranked path-first matching behavior to `findFiles()` in `packages/mimo-platform/src/files/service.ts`
- [x] 1.2 Add unit tests for path-first order and absolute/relative matching in `packages/mimo-platform/test/files-service.test.ts`

## 2. File finder prefill support

- [x] 2.1 Extend `openFileFinder()` in `packages/mimo-platform/public/js/edit-buffer.js` to accept an optional query
- [x] 2.2 Prefill and select finder input when opened from a query
- [x] 2.3 Apply ranked filtering in the edit-buffer finder list

## 3. Chat-to-file-finder linking

- [x] 3.1 Render file-like tokens in agent (assistant) message content as clickable controls in `packages/mimo-platform/public/js/chat.js`
- [x] 3.2 Add delegated click handler to open file finder with selected query
- [x] 3.3 Preserve raw agent message text for copy operations

## 4. UI polish

- [x] 4.1 Add `.chat-file-ref` styling in `packages/mimo-platform/src/components/SessionDetailPage.tsx`
