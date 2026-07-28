## 1. Domain layer: repository data model and operations

- [x] 1.1 Add `group: string` to `PinnedSessionEntry` in `packages/mimo-platform/src/domain/pinned-sessions/repository.ts`; update `PinnedSessionsFile` interface accordingly
- [x] 1.2 Update `read()` to coerce any entry missing a `group` field to `"Ungrouped"` (backward compat) and rewrite the file if any coercion happened
- [x] 1.3 Update `add()` signature to accept an optional `group: string` (default `"Ungrouped"`); change dedup filter to `sessionId === entry.sessionId && group === entry.group` (case-insensitive on group); keep cap logic on total entry count
- [x] 1.4 Add `listByGroup(username, group)` method that returns entries whose `group` matches the supplied value (case-insensitive); the existing `list()` remains a thin wrapper
- [x] 1.5 Add `removeByGroup(username, sessionId, group?)` to the repository: if `group` is supplied, remove only the entry with that `(sessionId, group)`; if omitted, remove all entries for that `sessionId`
- [x] 1.6 Update `PinnedSessionsRepositoryDeps` `limit` test override behavior unchanged; verify `PIN_LIMIT` semantics in tests

## 2. Internal API: types, handlers, validation

- [x] 2.1 Add `group?: string` to `CreatePinRequest` in `packages/mimo-platform/src/api/rest/pinned-sessions/types.ts`; document default in JSDoc
- [x] 2.2 Add `group: string` (required) to `PinListEntryResponse`
- [x] 2.3 Update `listPinsHandler` to read `?group=` from the query and call `listByGroup` when present; preserve current behavior when absent
- [x] 2.4 Update `createPinHandler` to read `group` from the request body, default to `"Ungrouped"`, and pass through to `add`; validate that the value is a non-empty string after trim
- [x] 2.5 Update `deletePinHandler` to read `?group=` from the query; if present, call `removeByGroup(user, sessionId, group)`; if absent, call `removeByGroup(user, sessionId)` to unpin across all groups
- [x] 2.6 Update `resolveEntry` helper to populate the new `group` field on every `PinListEntryResponse`
- [x] 2.7 Update integration test file `pinned-sessions.test.ts` for the new shapes: list with/without `?group=`, create with/without `group`, delete with/without `?group=`, stale entries still resolve with `group`

## 3. UI: session page inline group picker

- [x] 3.1 In `SessionDetailPage.tsx`, replace the `pinSlot` rendering with a slot that includes the existing checkbox and a `<div id="pin-groups-root">` for group chips; the chips and typeahead are populated client-side
- [x] 3.2 In `SessionDetailPage.tsx`, fetch the user's current pin list on page load (or use the existing `isPinned` lookup) to discover which groups the session is currently in; pass the list as a `data-pin-groups` JSON attribute on the root, or render the initial chips server-side
- [x] 3.3 In `public/js/pin-checkbox.js`, add group state management: fetch the current pin list on load, render one chip per group the session is in, render `+ add group` typeahead when checked
- [x] 3.4 In `public/js/pin-checkbox.js`, implement chip `×` removal: DELETE `/pinned-sessions/:sessionId?group=<name>`; refetch pin list and re-render
- [x] 3.5 In `public/js/pin-checkbox.js`, implement typeahead: list distinct groups from the user's pin list, accept new name (POST `{sessionId, projectId, group}`), refetch and re-render
- [x] 3.6 In `public/js/pin-checkbox.js`, when checked transitions to all-chips-removed, the checkbox becomes unchecked; when unchecked, all chips for the session are removed (DELETE without `?group=`)
- [x] 3.7 Suppress the inline group picker in embed mode (hide the `pin-groups-root` div when `?embed=1`)

## 4. UI: parallel page group chip toolbar

- [x] 4.1 In `PinnedParallelPage.tsx`, add a `groups` prop (the list of groups the user has, derived server-side from the pin store) and a `activeGroup` prop (the current `?group=` value or `null` for "All")
- [x] 4.2 Render the chip toolbar between the existing "Pinned Sessions" title and "Back to dashboard" link: one rounded chip per group plus an `All` chip; the active chip uses a filled style
- [x] 4.3 Make each chip a link to `/pinned` (for `All`) or `/pinned?group=<name>` (composing with the existing `?ids=` if present); the link is a plain anchor so right-click and back/forward work
- [x] 4.4 In `pages/pinned.tsx`, read `?group=` from the request; fetch all pins (for the chip set) and pins filtered by the group (for the columns) when the query is present; pass both to `PinnedParallelPage`
- [x] 4.5 Verify empty-state messaging still works for: no pins, no pins in the filtered group, no selection

## 5. UI: drawer group label

- [x] 5.1 In `public/js/pinned-sessions-drawer.js`, when rendering each entry, add a small label element below the title/branch showing the `group`
- [x] 5.2 Verify the drawer entry layout still fits and the selection checkbox is unaffected

## 6. Help system and small CSS

- [x] 6.1 In `packages/mimo-platform/src/domain/help/defaults.ts`, add a help entry for the new group chip toolbar on `/pinned` (e.g. `pinned-parallel-group-chips`)
- [x] 6.2 Add a help entry for the inline group picker on the session page (e.g. `session-detail-page-pin-group-picker`)
- [x] 6.3 In `Layout.tsx` styles block, add `.pin-group-chip`, `.pin-group-chip.active`, `.pin-group-add`, `.pinned-parallel-group-chips`, `.pinned-parallel-group-chip`, `.pinned-parallel-group-chip.active` rules; ensure chips are rounded (border-radius), legible, and color-contrast in dark theme

## 7. Tests

- [x] 7.1 Repository unit tests: `add` with explicit group, `add` without group defaults to `"Ungrouped"`, same session in two groups creates two entries, dedup on `(sessionId, group)`, cap counts total entries, `listByGroup` returns matching entries case-insensitively, `removeByGroup` with and without `group`
- [x] 7.2 Repository backward-compat test: load a YAML file with entries lacking `group`, verify they come back as `group: "Ungrouped"` and the file is rewritten on the next write
- [x] 7.3 Internal API integration tests in `pinned-sessions.test.ts`: list with/without `?group=`, create with/without `group` (verify default), delete with `?group=` (per-group) and without (across all groups), stale entries still resolve with `group`, 401 paths unchanged, cap still 409
- [x] 7.4 UI/SSR test: `/pinned?group=client-x` renders only the matching pins and the `client-x` chip is active
- [x] 7.5 UI/SSR test: drawer entry rendering includes the group label

## 8. End-to-end smoke test

- [ ] 8.1 Manual: log in, pin the same session under two different groups via the inline picker, navigate to `/pinned`, click each group chip, verify only matching columns render, remove a chip, verify the entry disappears, remove the last chip, verify the pin checkbox unchecks
- [ ] 8.2 Manual: log out and back in, verify the group labels persist
