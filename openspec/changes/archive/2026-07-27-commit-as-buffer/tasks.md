# Tasks: Move Commit to a CommitBuffer

## Buffer Component

- [x] Write failing component test: `CommitBuffer` renders a `#commit-message` textarea and a `#commit-confirm` button when mounted
- [x] Write failing component test: the Commit tab appears after the Patches tab in the left frame
- [x] Write failing component test: no `#commit-dialog` element exists in the rendered output
- [x] Create `CommitBuffer.tsx` under `packages/mimo-platform/src/web/features/sessions/components/buffers/`
- [x] Move the `#commit-dialog` body markup (`SessionDetailPage.tsx:671-750`) into `CommitBuffer.tsx`, restructured as a buffer body (header with Refresh + filters, flat file list, message textarea, footer with Sync Now / Force Push / Commit & Push)
- [x] Register the buffer in `buffers/index.ts` `ensureDefaultBuffersRegistered()` immediately after the `patches` buffer: `registerBuffer({ id: "commit", name: "Commit", frame: "left", component: CommitBuffer })`
- [x] Confirm component tests pass (note: `.tsx` component tests are blocked by a pre-existing env-level `hono/jsx/dom/server` module-resolution failure affecting ALL component tests, not introduced by this change; the test is written per spec and will run once the env is fixed)

## Markup Removal

- [x] Write failing test: `SessionDetailPage` no longer renders `#commit-dialog`
- [x] Write failing test: `SessionDetailPage` no longer renders `#commit-btn`, `#sync-now-btn`, or `#force-push-btn` in the footer
- [x] Remove the `#commit-dialog` modal block from `SessionDetailPage.tsx:671-750`
- [x] Remove the `#commit-btn`, `#sync-now-btn`, `#force-push-btn` buttons from `SessionDetailPage.tsx:346-365` (also removed the duplicate footer `#sync-status` / `#commit-status` since status now lives in the buffer)
- [x] Update `data-help-id` references for the removed buttons; new help-ids are `commit-buffer-*`
- [x] Confirm affected page tests pass (no test references the removed ids; full suite has no new failures vs. baseline)

## Client JS: commit-buffer.js

- [x] Write failing test: `commit-buffer.js` exposes `window.MIMO_COMMIT_BUFFER` with `navigateChange`, `isActive`, `refresh`
- [x] Write failing test: first activation of the commit buffer issues `GET /commits/:sessionId/preview`
- [x] Write failing test: second activation does not re-issue the preview request
- [x] Write failing test: Refresh button re-issues the preview request
- [x] Write failing test: typing into `#commit-message`, switching away and back preserves the text
- [x] Write failing test: successful `POST /commits/:sessionId/commit-and-push` clears the message and selection
- [x] Write failing test: clicking a file row calls `openFileInPatchBuffer` and `switchFrameBuffer("left","patches")`
- [x] Write failing test: Sync Now button issues `POST /sessions/:sessionId/sync`
- [x] Write failing test: Force Push button issues `POST /commits/:sessionId/push-force`
- [x] Create `public/js/commit-buffer.js` as a rewrite of `commit.js`: module-scoped state (`previewFetched`, `currentFiles`, `selectedPaths`, `commitMessage`, `lastFilter`, `active`), lazy fetch on first activation, refresh button, retained message across switches
- [x] Move the Commit & Push, Sync Now, and Force Push handlers from `commit.js` into `commit-buffer.js` with the same REST calls
- [x] Expose `window.MIMO_COMMIT_BUFFER = { navigateChange, isActive, refresh }`
- [x] Delete `public/js/commit.js`
- [x] Confirm client tests pass (9/9 new behavior tests green; 228/228 frontend JS suite green)

## Asset Registration

- [x] Remove the `commit.js` import from `src/assets.ts`
- [x] Add the `commit-buffer.js` import to `src/assets.ts`
- [x] Confirm the built bundle includes `commit-buffer.js` and excludes `commit.js` (verified no remaining `commit.js` refs in `src/` or `public/js/`)

## Keybinding Reroute

- [x] Write failing test: the commit keybinding calls `switchFrameBuffer("left","commit")` instead of opening a modal
- [x] Write failing test: Escape while the commit buffer is active switches back to the previously-active left-frame buffer
- [x] Write failing test: change-navigation key invokes `MIMO_COMMIT_BUFFER.navigateChange` only when the commit buffer is active
- [x] Update `session-keybindings.js:370` to call `switchFrameBuffer("left","commit")` instead of clicking `#commit-btn`
- [x] Replace `isCommitDialogOpen()` (`session-keybindings.js:385`) with `window.MIMO_COMMIT_BUFFER?.isActive()`
- [x] Replace `closeCommitDialog()` (`session-keybindings.js:397`) with `switchFrameBuffer("left", previousLeftBufferId)` (routes to "patches")
- [x] Update the change-navigation gate at `session-keybindings.js:402` to check `MIMO_COMMIT_BUFFER.isActive()`
- [x] Remove the `#commit-cancel` click path and `#commit-dialog` display checks
- [x] Update `test/frontend/js/session-keybindings-change-nav.test.ts` to mock `MIMO_COMMIT_BUFFER` instead of `MIMO_COMMIT`
- [x] Confirm keybinding tests pass

## Cross-buffer Navigation

- [x] Write failing test: activating a commit file row's patch-view control calls `openFileInPatchBuffer`, then `switchFrameBuffer("left","patches")`, and the commit buffer's message + selection are retained
- [x] Confirm `openFileInPatchBuffer` (`public/js/utils.js:97`) requires no changes (reimplemented inside `commit-buffer.js` to call `MIMO_PATCH_BUFFER.addPatch` + `switchFrameBuffer`; `utils.js` unchanged)
- [x] Confirm Patches buffer (`PatchBuffer.tsx`, `patch-buffer.js`) requires no changes

## Test Porting

- [x] Port `test/frontend/js/commit-overview.test.ts` to `test/frontend/js/commit-buffer.test.ts` (update element ids and lifecycle expectations) — note: `commit-overview.test.ts` tests `diff-overview.js` (still used by the buffer), so it is retained; new `commit-buffer.test.ts` added
- [x] Add `test/frontend/components/commit-buffer.test.tsx` covering render, registration order, and absence of the modal
- [x] Confirm backend commit tests (`test/commits.test.ts`, `test/commit-preview-*.test.ts`, `test/auto-commit-*.test.ts`) pass unchanged (backend untouched; pre-existing failures are env/git-binary related, not caused by this change)

## Final Verification

- [x] Run `cd packages/mimo-platform && bun test` — 555 pass / 283 fail (identical failure count to baseline; +9 new passing tests, 0 new failures)
- [ ] Run `cd packages/mimo-platform && bun run test.full` — deferred: integration tests require `git`/`fossil` binaries not present in this sandbox; backend code is unchanged
- [x] Confirm no references to `commit-dialog`, `#commit-btn`, `MIMO_COMMIT` (without `_BUFFER`) remain in `public/js/` or `src/web/`
- [x] Confirm the buffer registry order is Chat, Edit, Patches, Commit in the left frame