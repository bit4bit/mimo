## 1. Parser tests and fix (backend)

- [x] 1.1 Record rg `--json -B/-A` fixtures under `packages/mimo-platform/test/fixtures/` covering: single match, last match in file, adjacent/overlapping matches, match on line 1, multiple files, zero context
- [x] 1.2 Add `test/search-service-context.test.ts` with failing tests for every "Context lines belong to their own match" scenario, using the fixtures
- [x] 1.3 Export `parseRipgrepOutput(output, { beforeLines, afterLines, maxResults }, workspacePath)` and rewrite it as the per-file state machine (design D2); tests pass

## 2. Before/after options and result cap (backend)

- [x] 2.1 Add failing tests: `spawnRipgrep` passes `-B <n> -A <n>` (via an injected fake `os.command.run`), and the total cap returns `{ results, truncated }` correctly when matches exceed and exactly fill the cap (fixture with 7 matches, caps 6 and 7)
- [x] 2.2 Extend `SearchOptions` with `beforeLines`/`afterLines`, change `SearchService.searchContent` to return `{ results, truncated }`, and implement the cap (design D3)
- [x] 2.3 Add failing route tests for `GET /sessions/:id/search` param handling: `before`/`after`, legacy `context`, clamp to 0–10, NaN fallback to 2
- [x] 2.4 Update the route in `sessions.tsx` to parse and clamp params, pass the new options, and use the service's `truncated`; tests pass

## 3. Client helpers

- [x] 3.1 Add `test/frontend/js/content-finder-utils.test.ts` with failing tests for `clampContextValue`, `buildSearchUrl`, `buildResultLines` (line numbers, kinds, UTF-8 byte offsets to JS index for non-ASCII text), and `renderResultHtml` (escaping, highlight span, context styling)
- [x] 3.2 Create `public/js/content-finder-utils.js` (IIFE plus `module.exports`, like `expert-utils.js`); tests pass
- [x] 3.3 Register it in `src/assets.ts` and load it in `Layout.tsx` before `edit-buffer.js`

## 4. Modal UI

- [x] 4.1 Add `#content-finder-before` / `#content-finder-after` number inputs (min 0, max 10) next to the query input in `ContentFinderDialog.tsx`, with "↑"/"↓" labels and any needed CSS
- [x] 4.2 In `edit-buffer.js`: load values from `localStorage` key `mimo.contentFinder.context` on open (try/catch, default 2/2), and clamp and save them on change
- [x] 4.3 Wire the inputs: debounced re-search only after a completed search, Enter searches immediately, Escape closes; build the request with `buildSearchUrl` (covered by `test/frontend/js/content-finder-modal.test.ts`)
- [x] 4.4 Replace the body of `renderContentResults` with `renderResultHtml`, keeping selection, hover, click, and scroll-into-view behaviour

## 5. Edit buffer search button

- [x] 5.1 Add failing tests in `content-finder-modal.test.ts`: clicking the search button opens the Content Finder; confirming a result opens the file and keeps search before "+" in the tab bar
- [x] 5.2 Add `#content-search-btn` before `#open-file-finder-btn` in `EditBuffer.tsx`, wire it to `openContentFinder`, and keep it first in `renderTabs`

## 6. Verification

- [x] 6.1 Run `bun test` and `bun run test.full` in `packages/mimo-platform`; no new failures (pre-existing: mention-mode source grep, impact metric validation, GitHub-clone integration timeouts, missing shared-fossil-server module)
- [ ] 6.2 Manually check in the app (with user approval to run it): defaults, persistence across reopen, re-search on change, highlighting, adjacent-match context, search button before "+"
