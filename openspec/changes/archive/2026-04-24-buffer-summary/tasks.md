## 1. Config Extension

- [x] 1.1 Add `SummaryConfig` interface (`{ prompt?: string }`) to `config/service.ts`
- [x] 1.2 Add `summary?: SummaryConfig` field to `Config` interface in `config/service.ts`
- [x] 1.3 Add `sanitizeSummaryConfig()` function with default prompt fallback in `config/service.ts`
- [x] 1.4 Wire `sanitizeSummaryConfig` into `ConfigService.load()` (same pattern as `sanitizeSessionKeybindings`)
- [x] 1.5 Write unit tests for `sanitizeSummaryConfig` (missing field → default, custom value → used)

## 2. Summary API Endpoint

- [x] 2.1 Create `packages/mimo-platform/src/summary/` directory with `routes.tsx`
- [x] 2.2 Implement `POST /sessions/:id/summary/refresh` handler:
  - Reads `analyzeThreadId` and `summarizeThreadId` from request body
  - Loads history via `ChatService.loadHistory(sessionId, analyzeThreadId)`
  - Reads `summary.prompt` from `ConfigService`
  - Validates summarize-via thread has an active agent (return 400 if not)
  - Sends prompt + history to the agent via ACP
  - Streams response back to client
- [x] 2.3 Register summary routes in the main server router
- [x] 2.4 Write integration test: refresh with inactive agent returns 400 with error message
- [x] 2.5 Write integration test: refresh with active agent streams summary response

## 3. SummaryBuffer Component

- [x] 3.1 Create `packages/mimo-platform/src/components/SummaryBuffer.tsx`
  - Accepts `BufferProps` + `threads: ChatThread[]`
  - Renders two `<select>` dropdowns (analyze, summarize-via) with state icons
  - Renders Refresh button
  - Renders async progress badge (⏳ Summarizing...) while loading
  - Renders inline error on failure
  - Renders summary text on success (ephemeral JS var)
- [x] 3.2 Wire Refresh button to POST `/sessions/:id/summary/refresh` via fetch/SSE
- [x] 3.3 Pass `threads` prop from session page to `SummaryBuffer` (same pattern as `ChatThreadsBuffer`)

## 4. Buffer Registration

- [x] 4.1 Import `SummaryBuffer` in `buffers/index.ts`
- [x] 4.2 Register `summary` buffer (`frame: "right"`) after `impact` in `ensureDefaultBuffersRegistered()`

## 5. Tests

- [x] 5.1 Write unit test for `SummaryBuffer` renders both thread selectors with all threads
- [x] 5.2 Write unit test for `SummaryBuffer` shows progress badge on Refresh press
- [x] 5.3 Write unit test for `SummaryBuffer` renders summary text on successful response
- [x] 5.4 Write unit test for `SummaryBuffer` renders error message on 400 response
- [x] 5.5 Verify right frame tab bar includes `Summary` tab (integration/render test)
