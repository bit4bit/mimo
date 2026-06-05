## Why

Files created by the LLM agent do not appear in the file finder because `listFiles` uses `fossil ls`, which only returns VCS-tracked files. New files are written to disk but never added to Fossil, making them invisible to the file listing while remaining readable via the content endpoint. Additionally, the client-side file finder caches its file list in module scope and never invalidates it, so even if the server listing were fixed, newly created files would not appear until a full page reload.

## What Changes

- Replace `fossil ls` with a recursive filesystem directory walk in `listFiles`, filtered by the existing `isExcluded` path policy and `.fossil-ignore` / ignore patterns
- Add client-side invalidation of the file finder cache when file creation or change events are received via WebSocket
- Fix the agent's `file_changed` event to correctly set `isNew: true` for newly created files instead of always sending `isNew: false`

## Capabilities

### New Capabilities

- `file-finder-realtime`: Real-time file finder updates — the file finder reflects filesystem changes (new files, deletions) without requiring a page reload

### Modified Capabilities

- `file-sync`: The agent's `file_changed` WebSocket message must accurately report `isNew: true` for newly created files, not always `isNew: false`

## Impact

- `packages/mimo-platform/src/domain/files/service.ts` — `listFiles` implementation changes from `fossil ls` to filesystem walk
- `packages/mimo-platform/src/domain/files/file-watcher-service.ts` — may need directory-watch capability or new event type
- `packages/mimo-platform/public/js/edit-buffer.js` — `fileFinderLoaded` cache invalidation
- `packages/mimo-agent/src/index.ts` — `handleWriteFile` must detect new files and set `isNew: true`
- `openspec/specs/file-sync/spec.md` — already specifies `isNew: true` for new files; implementation just needs to match