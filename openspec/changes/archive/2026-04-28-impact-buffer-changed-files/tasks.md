## 1. EditBuffer API

- [x] 1.1 Expose `openFile(path)` on `window.EditBuffer` in `edit-buffer.js`

## 2. ImpactBuffer UI

- [x] 2.1 Add "Changed Files" section in `renderImpactMetrics()` in `chat.js`
- [x] 2.2 Add CSS for clickable file rows in `ImpactBuffer.tsx`

## 3. Upstream file content endpoint (server)

- [x] 3.1 Add `GET /sessions/:id/files/upstream-content?path=` route in `sessions/routes.tsx` reading from `session.upstreamPath`
- [x] 3.2 Session object already exposes `upstreamPath` — no extra context wiring needed

## 4. PatchBuffer: `originalEndpoint` + `readOnly` support

- [x] 4.1 Extend `addPatch` to accept optional `originalEndpoint` and `readOnly` params; store both on the tab
- [x] 4.2 In `loadPatchContent`, use `originalEndpoint` (if set) instead of `files/content` when fetching `originalPath`
- [x] 4.3 In `updateContextBar`, hide and disable approve/decline buttons when active tab has `readOnly: true`

## 5. ImpactBuffer: `changed` files open PatchBuffer

- [x] 5.1 `changed` file click calls `MIMO_PATCH_BUFFER.addPatch` with `originalEndpoint: "files/upstream-content"` and `readOnly: true`
- [x] 5.2 `new` files open EditBuffer; `deleted` files are no-op
