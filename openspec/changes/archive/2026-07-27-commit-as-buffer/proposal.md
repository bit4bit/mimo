# Proposal: Move Commit to a CommitBuffer

## Problem

The commit workflow today is split across two surfaces that are awkwardly coupled:

1. **Three footer-bar buttons** in `SessionDetailPage.tsx:346-365` (`#commit-btn`, `#sync-now-btn`, `#force-push-btn`) act as the global action entry points.
2. **A modal** (`#commit-dialog`, `SessionDetailPage.tsx:671-750`) is the actual review surface: it shows a flat list of changed files, a commit message textarea, and a confirm button.

This has three compounding problems:

1. **Modal lifecycle fights the buffer model.** Every other review surface in the app (Chat, Edit, Patches, Notes, File Tree, Impact, Summary, McpServers, Plan) is a registered buffer toggled via `switchFrameBuffer`. The commit modal is the only overlay, so its open/close state is tracked separately (`session-keybindings.js:385,402` queries `#commit-dialog` visibility) and its in-flight state (selected files, message) is lost on close.
2. **Footer actions are disconnected from the review.** `Sync Now` and `Force Push` live in the footer but their result status is rendered inside the modal — the user must open the modal to see whether sync succeeded.
3. **Cross-buffer navigation is one-way and asymmetric.** Clicking a modified file in the commit modal switches to the Patches buffer (`openFileInPatchBuffer` → `switchFrameBuffer("left","patches")`), but there is no symmetric path back to the commit review. Users must re-open the modal via the footer button, which re-fetches preview and loses any in-progress message.

## Proposed Solution

Move the commit review surface and all three footer actions into a single first-class **CommitBuffer** registered as a left-frame buffer with `id: "commit"`, placed immediately after the `patches` buffer.

- The buffer renders the existing flat list of changed files, a commit message textarea, and three action buttons: **Sync Now**, **Force Push**, **Commit & Push** — all in one buffer footer.
- The footer `#commit-btn` / `#sync-now-btn` / `#force-push-btn` buttons are **removed** from `SessionDetailPage.tsx`. The only way to commit is from inside the buffer, per the user's decision (no global action button).
- The `#commit-dialog` modal markup is **removed** entirely. The buffer replaces it.
- The commit message **persists across buffer switches** (module state in `commit-buffer.js`), since a buffer implies a non-modal flow where the user may navigate away and return.
- Preview is fetched **lazily on first switch** to the buffer (mirroring the Impact buffer's manual refresh pattern) and refreshable via an in-buffer Refresh button.
- Clicking a modified file row still calls `openFileInPatchBuffer` → `switchFrameBuffer("left","patches")` — that cross-nav path is unchanged and now symmetric (Patches sits directly adjacent to Commit in the left frame).
- The keybinding that opens the modal (`session-keybindings.js:370`) is rerouted to `switchFrameBuffer("left","commit")`. Escape, when the commit buffer is active, switches back to the previous buffer rather than "closing" a modal.
- `Sync Now` and `Force Push` handlers move into `commit-buffer.js` (their REST routes and `AutoCommitService` backend are untouched — this is a UI relocation only).

## Out of Scope

- Backend commit/sync/force-push logic (`CommitService`, `AutoCommitService`, `/commits/*` routes). These are unchanged.
- The `.mimo-patches/` pending-edit store and Patches buffer internals.
- The `sessions/{p}/{s}/patches/{ts}.patch` historical artifacts from patch-based-sync.
- A split view showing the commit list and patch diff side by side in one buffer (cross-buffer navigation remains the mechanism).
- The stale `src/domain/buffers/` registry (dead code, confirmed unused outside its own directory).
- Removal of `public/js/commit.js` as a registered asset — it is replaced by `public/js/commit-buffer.js`; the old file is deleted.

## Migration Summary

| Source | Destination |
|---|---|
| `#commit-dialog` markup `SessionDetailPage.tsx:671-750` | `CommitBuffer.tsx` (new, under `buffers/`) |
| `#commit-btn`/`#sync-now-btn`/`#force-push-btn` `SessionDetailPage.tsx:346-365` | removed; handlers → `commit-buffer.js` |
| `public/js/commit.js` (883-line IIFE) | `public/js/commit-buffer.js` (rewrite as a buffer, exposes `window.MIMO_COMMIT_BUFFER`) |
| `window.MIMO_COMMIT.{navigateChange,isOpen}` `commit.js:834` | `window.MIMO_COMMIT_BUFFER.{navigateChange,isActive}` |
| `session-keybindings.js:370` open modal | `switchFrameBuffer("left","commit")` |
| `session-keybindings.js:385,402` `#commit-dialog` checks | `MIMO_COMMIT_BUFFER.isActive()` |
| `session-keybindings.js:397` `#commit-cancel` close | switch to previous buffer |
| `test/frontend/js/commit-overview.test.ts` | `test/frontend/js/commit-buffer.test.ts` + `test/frontend/components/commit-buffer.test.tsx` |