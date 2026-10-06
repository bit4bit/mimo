## Context

Content search is already implemented end to end:

- `GET /sessions/:id/search?q=&context=N` (`sessions.tsx`) calls `SearchService.searchContent`, which runs `rg --json -i -n --context N --max-count 100`.
- `parseRipgrepOutput` (`search-service.ts`) turns rg JSON into `ContentSearchResult { path, line, column, text, matchStart, matchEnd, before[], after[] }`.
- The client (`edit-buffer.js`, Content Finder section) debounces input by 300ms, always sends `context=2`, and renders only `path:line` and `text`.

Current defects this change has to fix before context can be shown:

1. **Context attribution.** The parser decides "before" vs "after" by comparing a context line with the last result overall, which may be in a different file. Because the accumulator is attached to the _next_ match, the after-lines of match N land on match N+1, the before-lines of match N+1 are classified as "after", and the trailing after-lines of the last match in each file are dropped.
2. **Result cap.** `--max-count` limits matches per file, so the total can far exceed 100. The route computes `truncated` as `results.length >= 100`, which is wrong in both directions.
3. **Unvalidated param.** `context` goes through `parseInt` with no NaN or range check.

## Goals / Non-Goals

**Goals:**

- Users can choose how many lines to show before and after each match from inside the modal.
- Context lines are correct and contiguous for every match.
- `truncated` accurately reflects whether results were dropped.
- The API change is additive and backwards compatible.

**Non-Goals:**

- Keyboard shortcuts for changing the before/after values (can follow later).
- Grouping results under a single header per file (each match keeps its own path header).
- Fixing the approximate scroll-to-line (`lineHeight = 20`) when opening a result.
- Changing case sensitivity, regex handling, or the 300ms debounce.

## Decisions

### D1: Separate `before` / `after` params mapped to `rg -B` / `-A`

The route accepts `before` and `after` query params. If one is missing, it falls back to `context`, then to the default of 2. Each value is parsed as an integer; NaN becomes the default, and the result is clamped to `[0, 10]`. `SearchOptions` gains `beforeLines` / `afterLines`, and the service passes `-B <before> -A <after>` instead of `--context`.

_Alternative:_ a single symmetric `context` value. Rejected because the user explicitly wants before and after configured separately, and rg supports it natively.

### D2: Parser rewrite as a per-file state machine

The parser processes rg JSON events in order and keeps state per file:

- `begin` (new file): reset `openMatches = []` and `beforeBuffer = []`.
- For every line event (`context` **or** `match`), with line number `n` and text `t`:
  - Drop matches from `openMatches` whose window has closed (`n - m.line > afterLines`) and append `t` to the `after` of every remaining one. Several matches can be open at once when they are closer together than `afterLines` (e.g. matches on lines 7 and 8 both need line 9).
  - On `match`: create the result with `before = beforeBuffer` lines whose line number is `>= n - beforeLines` (in order), then add it to `openMatches`.
  - Push `{n, t}` to `beforeBuffer` and keep at most `beforeLines` entries. Clear the buffer when there is a gap (`n` is not the previous line + 1), so `before` is always contiguous and ends at `line - 1`.
- `end`: reset the per-file state.

Feeding match lines into the neighbouring buffers means two close matches (e.g. lines 10 and 11) show each other in their context, exactly as the file reads. rg already merges overlapping context windows into one contiguous stream, which this algorithm relies on.

Because `before` is guaranteed to be contiguous and to end at `line - 1`, and `after` to start at `line + 1`, the client can derive line numbers (`line - before.length + i`, `line + 1 + i`). `ContentSearchResult` keeps its existing shape, so there's no API break.

_Alternative:_ return `{ line, text }` objects in `before` and `after`. Rejected for now because the contiguity guarantee is enough and keeps the payload shape unchanged.

The parser is exported as a pure function, so it can be unit tested against recorded rg JSON fixtures without spawning rg.

### D3: Total result cap enforced in the service

The service stops collecting once `maxResults` results exist and reports whether more matches were seen. `searchContent` returns `{ results, truncated }` instead of a bare array. The route uses `truncated` directly. The only caller is the session search route. `--max-count` stays as a per-file guard against a single huge file.

_Alternative:_ keep the array return value and fetch `maxResults + 1`. Rejected because it leaks the cap logic into the route and is easy to get wrong.

### D4: Pure client helpers in a new `content-finder-utils.js`

The following move into `public/js/content-finder-utils.js`, which follows the `expert-utils.js` pattern (an IIFE on `window` plus `module.exports`):

- `clampContextValue(v)`
- `buildSearchUrl(sessionId, query, before, after)`
- `buildResultLines(result)` → `[{ lineNumber, text, kind: "before"|"match"|"after", matchStart?, matchEnd? }]`
- `renderResultHtml(result, active)`, which escapes all text and wraps only the `[matchStart, matchEnd)` slice in a highlight span

This makes the rendering and URL logic testable under `test/frontend/js/` the same way `expert-utils.test.ts` works. `edit-buffer.js` keeps the DOM wiring. The new file is registered in `src/assets.ts` and loaded in `Layout.tsx` before `edit-buffer.js`.

### D5: Modal inputs, persistence, and re-search

`ContentFinderDialog.tsx` adds two `<input type="number" min="0" max="10">` fields (`#content-finder-before`, `#content-finder-after`) on the same row as the query input, with "↑" and "↓" labels.

- On open, values load from `localStorage` key `mimo.contentFinder.context` (`{ before, after }`). Every read and write is wrapped in try/catch, and the default is 2/2.
- On `input`, the value is clamped, saved, and a search is scheduled with the same 300ms debounce, but only if the query input is non-empty and at least one search has completed in this modal session.
- Enter in a number input runs the search immediately. Escape closes the modal. Arrow keys keep their default behaviour (incrementing the number).

### D6: Rendering

Each result shows the `path:line` header, then one row per line from `buildResultLines`, with a right-aligned line-number gutter. Context rows are dimmed and the match row uses normal text colour with the highlighted substring. Rows use `white-space: pre` so indentation is preserved. The 50-results display limit stays.

## Risks / Trade-offs

- [rg JSON event ordering assumptions] → Cover with fixtures recorded from real `rg --json -B/-A` output: a single match, adjacent matches, overlapping windows, multiple files, a match on line 1, and a match at the end of a file.
- [Large context × many results inflates the payload] → Clamp to 10 lines and cap at 100 results (worst case about 2,100 lines).
- [`matchStart`/`matchEnd` are byte offsets from rg, while JS slices by UTF-16 code units] → Convert using a UTF-8 byte-to-index helper in `buildResultLines`, with a test for non-ASCII text.
- [Re-search on every change while typing a number] → Reuse the existing debounce and `AbortController` cancellation.

## Migration Plan

No data migration. The `context` param keeps working, so the rollout is a plain deploy. Rollback means reverting the change.
