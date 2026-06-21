# Tasks: Add Diff Change Navigation

## Reusable module: diff-overview

- [x] Write failing test: `collectHunks(rows, classify)` collapses consecutive changed rows into one hunk with correct start/end/type
- [x] Write failing test: a 40-line contiguous insertion yields exactly one hunk of type `added`
- [x] Write failing test: alternating added/removed rows produce a `mixed` hunk
- [x] Write failing test: tick geometry maps `startIndex/totalRows` to `tickTop` and clamps to `MIN_TICK_PX`
- [x] Write failing test: `controller.next()` / `prev()` advance the index and wrap at the ends
- [x] Write failing test: `controller.count()` returns `{ index, total }` matching the hunk list
- [x] Implement `public/js/diff-overview.js` exposing `window.MIMO_DIFF_OVERVIEW.attach(options)`
  - [x] `collectHunks(rows, classify)` helper
  - [x] render ticks (color by type, min height) into `trackEl`
  - [x] render + rAF-throttled update of the viewport thumb on `scroll`
  - [x] click tick → `scrollToHunk` (hunk ~⅓ from viewport top)
  - [x] `next()` / `prev()` with wrap, `count()`, `refresh()`, `destroy()`
- [x] Add the module `<script>` include to the page that loads the diff surfaces
- [x] Confirm module tests pass

## CSS

- [x] Add `.diff-overview-track`, `.diff-overview-tick` (+ `--added/--removed/--mixed`), `.diff-overview-thumb`, `.diff-change-counter` styles to `Layout.tsx`

## PatchBuffer integration (incl. sync-drift fix)

- [x] Write failing test: original and patched line arrays are padded to an equal canonical row count
- [x] Write failing test: with unequal added/removed counts, synced `scrollTop` keeps rows aligned (no drift)
- [x] Write failing test: hunks built from the canonical rows match the rendered changes
- [x] Pad both panes to a canonical row count in `renderDiff()` (placeholder rows where a side has no counterpart)
- [x] Add `#patch-overview-track` and `#patch-change-counter` elements to `PatchBuffer.tsx`
- [x] After `renderDiff()`, `attach()` one track (scrollEl = patched pane); store the controller for the active tab
- [x] On tab switch / re-render, `destroy()` the previous controller before re-attaching
- [x] Confirm PatchBuffer tests pass

## Commit dialog integration

- [x] Write failing test: each rendered file diff gets its own track and counter
- [x] Write failing test: switching the active file retargets navigation to that file's controller
- [x] In `renderFileDiff()` (`commit.js`), append a track element per `.file-diff` and `attach()` per file (classify by `.diff-line--*`)
- [x] Track the active file's controller for keyboard navigation
- [x] `destroy()` controllers when file diffs are re-rendered (avoid leaks)
- [x] Confirm commit dialog tests pass

## Keybindings

- [x] Write failing test: `nextChange` defaults to `Alt+Shift+ArrowDown`, `previousChange` to `Alt+Shift+ArrowUp`
- [x] Write failing test: overrides via `window.MIMO_SESSION_KEYBINDINGS` are honored
- [x] Write failing test: bindings do not fire while typing in an input/textarea (context-gated)
- [x] Add `nextChange` / `previousChange` to `DEFAULT_KEYBINDINGS` in `session-keybindings.js`
- [x] Route bindings in `onKeyDown` to the active PatchBuffer controller (gated to patch-buffer context)
- [x] Route bindings to the active commit-file controller (commit dialog takes precedence in the shared `routeChangeNav`; see note below)
- [x] Ensure `nextChange` / `previousChange` render in the shortcuts-help overlay
- [x] Confirm keybinding tests pass

> Implementation note: rather than duplicating the keybinding parser into
> `commit.js`, both surfaces are routed from `session-keybindings.js` via a single
> `routeChangeNav(direction)` helper (the registry owner already parses chords and
> honors overrides — duplicating it would violate the no-duplication rule). The
> commit dialog (a modal overlay) takes precedence when open; otherwise the
> PatchBuffer handles it when it is the active left buffer. `commit.js` exposes
> `window.MIMO_COMMIT.navigateChange` / `isOpen` as the integration hook.

## Verification

- [x] Run unit suite for `mimo-platform` (`bun test`): 1108 pass, 3 fail — all 3 failures are pre-existing and unrelated (confirmed identical at the pre-change base commit: 2 git-bootstrap tests fail because git user identity is unset in this env, 1 edit-buffer mention-mode test). `tsc --noEmit` is clean for every file touched by this change (one pre-existing syntax error remains in the untouched legacy `src/domain/buffers/ChatThreadsBuffer.tsx`). Note: `bun run test.full` (integration) additionally spawns fossil/git/network processes that are unavailable in this sandbox and was not run here.
- [ ] Manually verify in a browser: long file with two edits shows two ticks; clicking and keys jump correctly on both surfaces (requires a running app — left for the user, since starting the production server is disallowed by repo policy)
