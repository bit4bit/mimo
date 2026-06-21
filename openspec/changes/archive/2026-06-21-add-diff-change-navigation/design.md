# Design: Add Diff Change Navigation

## Architecture Overview

One reusable module, fed by both diff surfaces:

```
                   ┌──────────────────────────────────────┐
                   │   diff-overview.js  (new module)       │
                   │   window.MIMO_DIFF_OVERVIEW            │
                   │                                       │
   hunks[] ───────▶│  • render marker track (ticks)        │──▶ overlay <div>
   { startRatio,   │  • render viewport thumb              │
     endRatio,     │  • click tick  → scrollToHunk()       │
     type }        │  • next() / prev() + counter "n / N"  │
   scrollEl ──────▶│  • returns a controller handle        │
                   └──────────────────────────────────────┘
                        ▲                          ▲
            ┌───────────┘                          └───────────┐
   patch-buffer.js                                       commit.js
   (data-line-type on rows,                     (.diff-line--added/removed,
    two synced panes → ONE track)                unified, ONE track per file)
```

The module is surface-agnostic: it consumes a list of hunks expressed as scroll
ratios plus the element that scrolls. It does not know how the diff was produced.

## The reusable module: `MIMO_DIFF_OVERVIEW`

```ts
interface Hunk {
  startIndex: number;          // first changed row index (0-based)
  endIndex: number;            // last changed row index (inclusive)
  type: "added" | "removed" | "mixed";
}

interface OverviewOptions {
  scrollEl: HTMLElement;       // the element whose scrollTop changes
  trackEl: HTMLElement;        // empty container to render ticks/thumb into
  totalRows: number;           // canonical row count for ratio math
  hunks: Hunk[];
  onScrollToHunk?: (h: Hunk) => void;
}

interface OverviewController {
  next(): void;                // scroll next hunk into view, wraps
  prev(): void;                // scroll prev hunk into view, wraps
  count(): { index: number; total: number };  // for "3 / 7"
  refresh(hunks, totalRows): void;             // re-render after re-diff
  destroy(): void;             // remove listeners + nodes
}

window.MIMO_DIFF_OVERVIEW.attach(options): OverviewController
```

### Tick geometry

Rows are fixed-height monospace, so position is linear in row index:

```
tickTop    = (hunk.startIndex / totalRows) * trackHeight
tickHeight = max(MIN_TICK_PX, (hunk.endIndex - hunk.startIndex + 1)
                              / totalRows * trackHeight)   // MIN_TICK_PX ≈ 3
```

### Thumb

The viewport thumb mirrors the scroll position:

```
thumbTop    = (scrollEl.scrollTop / scrollEl.scrollHeight) * trackHeight
thumbHeight = (scrollEl.clientHeight / scrollEl.scrollHeight) * trackHeight
```

Updated on `scroll` (rAF-throttled).

### Scroll-into-view

`scrollToHunk` positions the hunk roughly one-third down the viewport so the
reviewer sees a little context above it:

```
target = hunk.startIndex * rowHeight - scrollEl.clientHeight / 3
scrollEl.scrollTop = clamp(target, 0, maxScroll)
```

## Building hunks from rendered rows

Walk the rendered rows once and collapse runs of changed lines:

```
rows:  U U R A A U U U ... U A U      (U=unchanged R=removed A=added)
            └─┬─┘              └ hunk 2 (1 line, type "added")
              hunk 1 (3 lines, type "mixed")
```

A small shared helper `collectHunks(rows, classify)` does this, where `classify`
returns `"added" | "removed" | "unchanged"`:

- **PatchBuffer**: `classify` reads `data-line-type` on each row of the canonical
  (padded) row list.
- **Commit dialog**: `classify` reads the `diff-line--added` / `diff-line--removed`
  / `diff-line--context` class on each `.diff-line`.

## Per-surface integration

### PatchBuffer (two panes → one track)

After `renderDiff()` builds both panes:

1. Pad both `original.lines` and `modified.lines` to an equal **canonical row
   count** by emitting empty placeholder rows where one side has no counterpart.
   This is the bundled sync-drift fix — pixel `scrollTop` sync becomes exact, and
   both panes share one row indexing.
2. Build hunks from the canonical row list (added on the patched side, removed on
   the original side, both → `mixed`).
3. `attach()` one track on the right edge of `patch-diff-container`. `scrollEl` is
   the patched pane (the one that drives sync).
4. Store the returned controller so the keybinding handler can call `next/prev`.

```
PatchBuffer.tsx  adds:  <div id="patch-overview-track" class="diff-overview-track"></div>
                        <div id="patch-change-counter" class="diff-change-counter"></div>
```

### Commit dialog (one track per file)

In `renderFileDiff()`, each rendered `.file-diff` block gets its own track element
and `attach()` call. `scrollEl` is that file's diff scroller. The active file's
controller is the navigation target for the keys.

## Keybindings

Two new entries in `DEFAULT_KEYBINDINGS` (`session-keybindings.js`), configurable
via `window.MIMO_SESSION_KEYBINDINGS` like every other binding:

```
nextChange:      "Alt+Shift+ArrowDown"
previousChange:  "Alt+Shift+ArrowUp"
```

Routing:

- **PatchBuffer**: handled in the existing capture-phase `onKeyDown`, gated to fire
  only when the active left buffer is the patch buffer (same gating used by
  `approvePatch` / `declinePatch`). Calls the active PatchBuffer controller's
  `next()` / `prev()`.
- **Commit dialog**: handled in `handleCommitKeyboard` (commit.js already owns a
  scoped keydown handler on the modal). Calls the active file's controller.

Both appear in the shortcuts-help overlay automatically since it renders from the
keybinding registry.

> Rationale: plain `n` / `p` were considered but rejected — every binding in the
> app is a modifier chord, and modifier-less keys collide with typing and
> complicate the global capture-phase handler. `Alt+Shift+Arrow` mirrors the
> existing `nextFile` / `previousFile` pattern.

## CSS (shared, in Layout.tsx)

```
.diff-overview-track   position:relative; width ~10px; full height; subtle bg
.diff-overview-tick    position:absolute; right:0; width:100%; rounded; cursor:pointer
   --added  green (#4caf50)   --removed red (#f44336)   --mixed gradient/amber
.diff-overview-thumb   position:absolute; faint outline of the viewport
.diff-change-counter   small monospace "n / N", muted
```

## Risks / Notes

- **Re-diff churn**: when content re-renders, call `controller.refresh()` or
  `destroy()` + re-`attach()` so stale ticks/listeners don't leak. The commit
  dialog re-renders file diffs on selection changes — must tear down per file.
- **Empty diff**: zero hunks → render no ticks, counter shows `0 / 0`, keys no-op.
- **Very large files**: ticks are O(hunks) not O(lines) thanks to grouping, so the
  track stays cheap.
