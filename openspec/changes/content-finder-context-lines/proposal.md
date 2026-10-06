## Why

The Content Finder (Alt+Shift+C) shows only the matching line, so users can't judge whether a hit is the one they want without opening the file. The backend already computes context lines, but the client hardcodes `context=2`, never renders them, and the ripgrep parser attaches context to the wrong matches.

## What Changes

- The search endpoint accepts separate `before` and `after` params (each clamped to 0–10). The existing `context` param stays as a shorthand for both.
- Fix `parseRipgrepOutput` so `before`/`after` arrays belong to the correct match, scoped per file, including the trailing context of the last match in each file and overlapping context between nearby matches.
- Enforce a true total result cap on the server (today `--max-count` limits per file) so `truncated` is accurate.
- The Content Finder modal gets two numeric inputs ("before" / "after"), defaulting to 2/2 and persisted in `localStorage`. Changing either value re-runs the last completed query.
- Each result renders the path header, line numbers, dimmed context lines, and the matching line with the matched substring highlighted (from `matchStart`/`matchEnd`).

## Capabilities

### New Capabilities

- `content-search`: configurable context lines in content search results, correct context attribution, total result cap, and context rendering in the Content Finder modal. (The base `content-search` spec from the unarchived `content-finder` change is not in `openspec/specs/` yet, so these are added requirements.)

### Modified Capabilities

<!-- none -->

## Impact

- `packages/mimo-platform/src/domain/files/search-service.ts`: rg args (`-B`/`-A`), parser rewrite, total cap
- `packages/mimo-platform/src/domain/files/types.ts`: `SearchOptions` gains `beforeLines`/`afterLines`
- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx`: `GET /sessions/:id/search` param parsing and clamping
- `packages/mimo-platform/src/web/shared/components/ContentFinderDialog.tsx`: before/after inputs
- `packages/mimo-platform/public/js/edit-buffer.js`: request params, settings persistence, re-search on change, result rendering
- API: additive and backwards compatible (`context` still works)
