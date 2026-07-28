## Why

Pinned sessions are a flat ordered list capped at 5 per user. When a user works on multiple parallel efforts (e.g. "client-x", "docs", "spike"), every pin competes for the same 5 slots, and the `/pinned` parallel view always shows all selected pins together regardless of which effort they belong to. Users need a way to tag pins into groups so the parallel view can be filtered to one effort at a time, and to keep several pins in different groups without losing them to the cap.

## What Changes

- Add a required `group` field to `PinnedSessionEntry`; default value is `"Ungrouped"` on create
- A single session may be pinned in multiple groups (dedup key becomes `(sessionId, group)`)
- The pin UI in the session page top-nav gains an inline group picker next to the existing checkbox; the picker supports typeahead over existing groups and creating a new one
- The `/pinned` toolbar gains rounded group chips next to "Back to dashboard"; selecting a chip filters the parallel columns to that group, using the URL query string as source of truth
- The `/api/internal/users/:userId/pinned-sessions` list endpoint accepts an optional `?group=<name>` filter; the `CreatePinRequest` accepts a `group` field
- The global 5-pin cap is unchanged: it counts total entries across all groups
- Existing pins written before this change are read back as `group: "Ungrouped"` (backward compatible — no data migration required)

## Capabilities

### Modified Capabilities

- `pinned-sessions`: Pin entries carry a required `group`; the same session may appear in multiple groups; the parallel view supports group filtering via URL query and group chips in the toolbar.

## Impact

- **Domain repository** (`packages/mimo-platform/src/domain/pinned-sessions/repository.ts`): `PinnedSessionEntry` gains `group: string`; `add` signature accepts an optional `group` (default `"Ungrouped"`); new `listByGroup(username, group)` method; cap logic still counts total entries
- **Internal API** (`packages/mimo-platform/src/api/rest/pinned-sessions/`): `CreatePinRequest` accepts `group`; `PinListEntryResponse` includes `group`; `listPinsHandler` reads `?group=` and calls `listByGroup`; `createPinHandler` validates `group` and passes through
- **Type contract** (`packages/mimo-platform/src/api/rest/pinned-sessions/types.ts`): add `group` to request/response types
- **UI: Session page** (`packages/mimo-platform/src/web/features/sessions/components/SessionDetailPage.tsx`): replace bare checkbox with checkbox + inline group chips + typeahead add control
- **UI: Client script** (`packages/mimo-platform/public/js/pin-checkbox.js`): POST `group` on add; DELETE entries per `(sessionId, group)`; refetch pin state to keep checkbox and chips in sync
- **UI: Parallel page** (`packages/mimo-platform/src/web/features/pinned-sessions/components/PinnedParallelPage.tsx`): render group chips toolbar; accept and forward `group` prop
- **UI: Parallel page server route** (`packages/mimo-platform/src/web/features/pinned-sessions/pages/pinned.tsx`): read `?group=` query and call `listByGroup`
- **UI: Parallel page client script** (`packages/mimo-platform/public/js/pinned-parallel.js`): when a chip is clicked, navigate to `/pinned?group=<name>`; preserve current selection behavior of `?ids=`
- **Drawer** (`packages/mimo-platform/src/web/features/pinned-sessions/components/PinnedSessionsDrawer.tsx`, `public/js/pinned-sessions-drawer.js`): show `group` as a small label under each entry title; no per-entry group editor in the drawer (group editing happens on the session page)
- **Help system** (`packages/mimo-platform/src/domain/help/defaults.ts`): add help ids for new chip-filter and inline-group-picker affordances
- **Tests**: BDD integration tests for: pin with explicit group, pin with default `"Ungrouped"`, same session in two groups, list filtered by group, cap is global across groups, stale pins still resolve with `group`, backward compat (legacy file without `group` field)
- **Spec delta** (`openspec/specs/pinned-sessions/spec.md`): new requirements for group tagging, multi-group, default group, group-filter on list, group chip toolbar on `/pinned`
- **Auth**: No changes
- **Migration**: None — old `pinned-sessions.yaml` files without `group` fields are read as `group: "Ungrouped"`
