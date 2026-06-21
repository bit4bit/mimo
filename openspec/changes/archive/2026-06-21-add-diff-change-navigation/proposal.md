# Proposal: Add Diff Change Navigation

## Problem

When reviewing a patch or a commit diff, there is no way to tell **where** the
changes are in a file without scrolling the whole thing. On a long file with a
couple of small edits, the reviewer scrolls top-to-bottom hunting for the colored
lines. The native browser scrollbar carries no information about change locations,
and there is no way to jump between changes.

This affects two surfaces that render diffs:

1. **PatchBuffer** — the vertical-split ORIGINAL / PATCHED diff view
   (`public/js/patch-buffer.js`, `PatchBuffer.tsx`).
2. **Commit dialog** — the per-file unified diffs in the commit modal
   (`public/js/commit.js` → `renderFileDiff`).

## Proposed Solution

Add **diff change navigation** to both surfaces, built on a single reusable
browser module so the two diff surfaces behave identically.

1. **Change overview track** — a thin custom marker track rendered alongside each
   scrollable diff. Each change hunk is drawn as a colored tick (green = added,
   red = removed, mixed = both) positioned proportionally to its location in the
   file. The current viewport is shown as a thumb. Clicking a tick scrolls that
   hunk into view. (The native browser scrollbar cannot be annotated, so this is a
   custom overlay positioned next to the content.)

2. **Jump-to-change keybindings** — two new entries in the existing session
   keybinding registry, `nextChange` (`Alt+Shift+ArrowDown`) and `previousChange`
   (`Alt+Shift+ArrowUp`), that scroll the next/previous hunk into view and wrap
   around. A small counter (`3 / 7`) shows position within the file. The bindings
   are user-configurable and context-gated to fire only when a diff surface is
   active, consistent with every other binding in the app.

3. **Hunk grouping** — consecutive changed lines collapse into one hunk so a large
   insertion draws one marker, not one per line; ticks have a minimum height so
   single-line changes stay visible.

4. **Bundled sync-scroll correctness fix** — the PatchBuffer currently syncs panes
   by copying `scrollTop` in pixels, which assumes both panes have equal height. On
   lopsided diffs (different added/removed counts) the panes drift. Both panes are
   padded to an equal canonical row count so pixel-based sync is exact; this shared
   row indexing also backs the overview track.

## Out of Scope

- A full scaled-down minimap (rendering a shrunken copy of the file). Tick marks
  match the terminal aesthetic and are far cheaper.
- Cross-file navigation in the commit dialog (each file gets its own track and the
  keys walk hunks within the active file).
- Annotating the OS-native scrollbar (not possible cross-browser).
- New diff surfaces beyond PatchBuffer and the commit dialog.
