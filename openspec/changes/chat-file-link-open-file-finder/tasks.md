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

## 5. Extension-based file token detection

- [x] 5.1 Add `chatFileExtensions` field and `defaultChatFileExtensions` to `packages/mimo-platform/src/config/service.ts`
- [x] 5.2 Merge user-supplied extensions on top of defaults in `sanitizeChatFileExtensions`
- [x] 5.3 Inject `window.MIMO_CHAT_FILE_EXTENSIONS` via `packages/mimo-platform/src/components/Layout.tsx`
- [x] 5.4 Thread `chatFileExtensions` through `SessionDetailPage` and `sessions/routes.tsx`
- [x] 5.5 Replace open-ended regex in `isLikelyFileToken` with extension-set lookup in `packages/mimo-platform/public/js/chat.js`

## 6. File finder regression coverage

- [x] 6.1 Add `packages/mimo-platform/test/files-routes.test.ts` covering no-pattern returns all files, filtered results, path-priority, and 404
