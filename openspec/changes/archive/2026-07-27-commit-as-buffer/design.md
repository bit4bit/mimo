# Design: Move Commit to a CommitBuffer

## Architecture Overview

```
LEFT FRAME BUFFERS
┌──────────────────┐
│ chat             │
│ edit             │
│ patches          │
│ commit  ◄ NEW    │  registered via buffers/index.ts ensureDefaultBuffersRegistered()
└──────────────────┘

COMMIT BUFFER (id: "commit", frame: "left")
┌─────────────────────────────────────────────┐
│  [Refresh]   filter: all / staged / modified │
├─────────────────────────────────────────────┤
│  ☐ src/foo.ts        modified   [view patch] │  ← click → switchFrameBuffer("left","patches")
│  ☐ src/bar.ts        added      [view patch] │     via openFileInPatchBuffer (unchanged)
│  ...                                         │
├─────────────────────────────────────────────┤
│  Commit message:                            │
│  ┌─────────────────────────────────────────┐│
│  │  (persists across buffer switches)     ││  ← module state in commit-buffer.js
│  └─────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│  [Sync Now] [Force Push]   [Commit & Push]  │  ← relocated from footer bar
└─────────────────────────────────────────────┘

Backend (UNCHANGED):
  CommitService.getPreview / commitAndPush / forcePush
  AutoCommitService.handleThoughtEnd / syncNow
  /commits/:sessionId/preview, /commit-and-push, /push-force, /sync
```

---

## Buffer Registration

The buffer is registered in `packages/mimo-platform/src/web/features/sessions/components/buffers/index.ts` `ensureDefaultBuffersRegistered()`, immediately after the `patches` buffer:

```ts
registerBuffer({ id: "commit", name: "Commit", frame: "left", component: CommitBuffer });
```

The registry is an array ordered by insertion; placement after `patches` satisfies the "next to Patches" requirement. No enum, no switch — rendering is data-driven via `Frame.tsx:60`.

---

## Component: CommitBuffer.tsx

`FC<BufferProps>` (same interface as `PatchBuffer`, `ImpactBuffer`, etc.). Renders the markup currently inside `#commit-dialog` (`SessionDetailPage.tsx:671-750`), restructured as an always-mounted buffer body:

- Header row: Refresh button, status filters (all / staged / modified — preserved from current modal).
- File list: flat list of changed files using the shared `renderChangedFileRow()` (`public/js/utils.js:25`). Each row has a checkbox, status, and a "view patch" affordance that calls `openFileInPatchBuffer`.
- Message textarea: `id="commit-message"`, value bound to `commit-buffer.js` module state (not component state, so it survives unmount).
- Footer actions: `#sync-now-btn`, `#force-push-btn`, `#commit-confirm` (Commit & Push), plus a `#commit-status` span for results.

The component is intentionally thin — all interactivity lives in `public/js/commit-buffer.js`, matching the established pattern (`PatchBuffer.tsx` + `patch-buffer.js`, `ImpactBuffer.tsx` + `chat.js` impact section).

---

## Client JS: commit-buffer.js

A rewrite of `public/js/commit.js` (883-line IIFE) as a buffer module. Key differences from the modal version:

### Lifecycle

```
on buffer activation (switchFrameBuffer("left","commit")):
  if (preview not yet fetched)  → fetchPreview()
  else                          → render existing list + restore message
  refresh sync-status interval resumes

on buffer deactivation (switch to other buffer):
  commit message retained in module state
  preview list retained in module state
  sync-status interval pauses
```

### State (module-scoped, survives buffer switches)

```js
let previewFetched = false;
let currentFiles = [];        // flat list from /commits/:sid/preview
let selectedPaths = new Set();
let commitMessage = "";       // persisted across switches
let lastFilter = "all";
let active = false;           // isActive()
```

### Lazy fetch (mirrors Impact buffer pattern)

`fetchPreview()` calls `GET /commits/:sessionId/preview` on **first activation only**. A Refresh button re-fetches on demand. This avoids running the commit preview computation on every session page load.

### Exposed surface

```js
window.MIMO_COMMIT_BUFFER = {
  navigateChange: navigateCommitChange,   // for keybinding registry
  isActive: () => active,                  // replaces isCommitDialogOpen
  refresh: fetchPreview,                   // programmatic refresh
};
```

### Action handlers (relocated from footer/modal)

- **Commit & Push** (`#commit-confirm`): `POST /commits/:sessionId/commit-and-push` with selected paths + message. On success: clear message, clear selection, refresh preview, show success in `#commit-status`.
- **Sync Now** (`#sync-now-btn`): `POST /:sessionId/sync` (auto-commit route). Result in `#commit-status`.
- **Force Push** (`#force-push-btn`): `POST /commits/:sessionId/push-force`. Result in `#commit-status`.

All three handlers are lifted verbatim from `commit.js` with the only change being the source element ids (which stay the same since the markup moves with them) and the surrounding lifecycle.

---

## Keybinding Reroute

`session-keybindings.js` currently has three modal-coupled branches:

| Line | Current | New |
|---|---|---|
| `:370` | `#commit-btn` click to open modal | `switchFrameBuffer("left","commit")` |
| `:385` | `isCommitDialogOpen()` checks `#commit-dialog` display | `window.MIMO_COMMIT_BUFFER?.isActive()` |
| `:397` | `closeCommitDialog()` clicks `#commit-cancel` | `switchFrameBuffer("left", previousBufferId)` |
| `:402` | commit-dialog open check for change-navigation | `MIMO_COMMIT_BUFFER.isActive()` before `navigateChange` |

The Escape key, when the commit buffer is active, switches back to the previously-active left-frame buffer (tracked in `commit-buffer.js` module state or read from `/sessions/:id/frame-state`). It does **not** "close" anything — buffers don't close.

---

## Cross-buffer Navigation (unchanged)

```
Commit buffer file row  ──openFileInPatchBuffer──▶  Patches buffer
                                                       │
                                                       │  user switches back
                                                       ▼
                                                  Commit buffer (state intact)
```

`openFileInPatchBuffer` (`public/js/utils.js:97`) calls `window.MIMO_PATCH_BUFFER.addPatch(...)` then `switchFrameBuffer("left","patches")`. This path is unchanged. Because Commit and Patches are adjacent left-frame buffers, the round trip is a single `switchFrameBuffer` away in each direction and no state is lost (commit message + selection persist in module state).

---

## Asset Registration

`src/assets.ts` imports static JS assets. `commit.js` is replaced:

- Remove the `commit.js` import.
- Add `commit-buffer.js` import.
- `commit.js` file is deleted from `public/js/`.

---

## Removal Checklist

- `SessionDetailPage.tsx:346-365` — `#commit-btn`, `#sync-now-btn`, `#force-push-btn` footer buttons.
- `SessionDetailPage.tsx:671-750` — entire `#commit-dialog` modal block.
- `public/js/commit.js` — deleted (logic ported to `commit-buffer.js`).
- `session-keybindings.js:385-402` — `isCommitDialogOpen`/`closeCommitDialog` modal helpers (replaced by buffer isActive + switchFrameBuffer).
- `data-help-id` references to the removed buttons are updated; orientation/help text referencing "commit modal" is updated to "commit buffer".

---

## What Stays Unchanged

- `CommitService` (`src/domain/commits/service.ts`) and all `/commits/*` REST routes.
- `AutoCommitService` (`src/domain/auto-commit/service.ts`) and `/sessions/:id/sync` routes.
- `ChangedFilesCache` shared between commit preview and impact buffer.
- `openFileInPatchBuffer` and the Patches buffer.
- The web buffer registry mechanism (`registry.ts`, `Frame.tsx`).
- The stale `src/domain/buffers/` registry (left alone — out of scope, confirmed dead).