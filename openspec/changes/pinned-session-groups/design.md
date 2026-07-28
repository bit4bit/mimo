## Context

The pinned-sessions feature already exists as a per-user ordered list with a global 5-entry cap (`packages/mimo-platform/src/domain/pinned-sessions/repository.ts`). The pin UI is a single checkbox in the session top-nav (`SessionDetailPage.tsx:218`) and the parallel view is at `/pinned` (`PinnedParallelPage.tsx`). The 5-cap is enforced at `add` time and returns 409 `pin_limit_reached`.

The proposal adds a required `group` to each pin entry so users can split their 5 slots across multiple parallel efforts, and adds a group-filter UI to the parallel view. The cap stays global; the same session can be pinned in multiple groups. The existing on-disk format is `pinned-sessions.yaml` with an `entries: [{sessionId, projectId}]` array — backward compatibility means treating any entry missing `group` as `"Ungrouped"`.

The change touches three layers: the domain repository (data model + new query), the internal API (request/response shape + filter), and the web UI (inline group picker on the session page, group chip toolbar on the parallel page, drawer label).

## Goals / Non-Goals

**Goals:**
- Let users tag a pin with one of their existing groups, or create a new group at pin time, from the session page itself
- Let the same session be pinned in N different groups
- Filter the `/pinned` parallel view to a single group via UI chips that drive a `?group=` query
- Preserve the existing 5-entry global cap, the existing pin/unpin affordance, and the existing drawer selection behavior
- Keep the on-disk format forward- and backward-compatible (no migration)

**Non-Goals:**
- Per-group pin caps
- Group rename, group delete, or group CRUD separate from pins
- Editing a pin's group from the drawer (the session page is the edit surface)
- Sharing groups across users
- Multi-select group filter on `/pinned` (single group at a time, plus the "All" chip)
- Migration of existing pins (legacy entries are read as `group: "Ungrouped"`)

## Decisions

### 1. Group is a required, non-null string on the entry; `"Ungrouped"` is the default literal

**Decision**: `PinnedSessionEntry.group: string` (no `null`). When the request omits `group`, the handler defaults it to `"Ungrouped"`. When the on-disk file lacks a `group` field, the repository coerces to `"Ungrouped"` on read.

**Rationale**: A literal default is simpler than `string | null` — no nullable handling in the UI, the API, or the repository, and the `/pinned` chip toolbar renders uniformly. `"Ungrouped"` is just another group; it appears in the chip toolbar if any pin lacks a group, and disappears automatically when the last one moves or unpins.

**Alternatives considered**:
- `group: string | null` (null = ungrouped) — pushed the null-handling into every layer; rejected for the same uniformity reason.
- Require the user to type a name on every pin — rejected as friction; "force to a default group" was the explicit product decision.

### 2. Dedup key is `(sessionId, group)`; a session can be in multiple groups

**Decision**: The repository's `add` filters existing entries by both `sessionId` AND `group`; re-adding the same `(sessionId, group)` moves the entry to the front without creating a duplicate. Adding the same `sessionId` under a different `group` is allowed and creates a second entry.

**Rationale**: Matches the explicit "allow same pin multiple groups" product call. The 5-entry cap still applies across all groups, so a session in 3 groups consumes 3 of the 5 slots.

**Alternatives considered**:
- One entry per `sessionId`, with `group` as a switchable label — rejected because it can't represent "session appears in two groups simultaneously."
- A `groups: string[]` array on the entry — equivalent in semantics but makes the YAML harder to diff and the "remove one group" operation less clean (set diffs).

### 3. Group filter on the list endpoint, not in-memory

**Decision**: The list handler reads `?group=<name>` and calls a new `listByGroup(username, group)` repository method. The repository returns entries whose `group` equals the query value (case-insensitive match against the stored value, which is always stored in the user's typed casing).

**Rationale**: Filtering at the repository keeps the response payload small (the cap is 5 so it's not a perf concern, but staying consistent with the layer boundary matters). Case-insensitive matching handles the obvious case where the user types `Client-X` once and `client-x` later.

**Alternatives considered**:
- Filter in the handler after a full `list()` — works at this scale but breaks the existing pattern where handlers are thin pass-throughs to repository methods.
- Add an index by group in the YAML — overkill for ≤5 entries.

### 4. Inline group picker next to the checkbox, not a popover or a separate page

**Decision**: On the session page, the pin slot renders the existing checkbox plus, when checked, one removable chip per group the session is currently pinned in, plus an `+ add group` control that opens a small typeahead listing existing groups and accepting a new name.

**Rationale**: The user explicitly chose "inline next to checkbox." Inline means the picker is always visible at the point of decision; chips communicate current memberships without forcing a modal; the typeahead handles both selection and creation in one control. Compared to a popover, inline chips make the multi-group state readable at a glance and let the user remove a group with one click (`×`).

**Alternatives considered**:
- Popover on the checkbox — hides the state once dismissed; rejected for that reason.
- A "set group" button after pinning, in the top-nav — same affordance, but split into two locations; the inline chips keep it in one place.

### 5. Group chips on the parallel page toolbar, URL-driven

**Decision**: The `/pinned` toolbar renders one rounded chip per group that has at least one pin, plus an always-present `All` chip. Clicking a chip navigates to `/pinned?group=<name>` (or `/pinned` for `All`). The current `?ids=` selection query param is preserved — the two filters compose (group filter + drawer selection).

**Rationale**: URL as source of truth means browser back/forward work, the page is shareable, and the chip state is reconstructable on reload. The chip set is derived from the data (groups with ≥1 pin), so it auto-collapses to nothing when the user removes the last pin from a group — no separate "manage chips" UI.

**Alternatives considered**:
- Client-side chip state with no URL param — loses back/forward.
- A dropdown instead of chips — saves horizontal space but hides the available groups and adds a click; the chip set is small (≤ 5) so a row of chips fits.

### 6. The drawer is read-only for groups in v1

**Decision**: The drawer shows the group as a small secondary label under each entry's title and branch, but offers no way to edit or remove the group from there. All group changes happen on the session page.

**Rationale**: The drawer is for jumping to a session, not for editing it. The selection checkbox in the drawer is already distinct from the pin checkbox; adding a third control per entry (group editor) would crowd the row. The session page is the natural place to edit a session's groups.

**Alternatives considered**:
- Per-entry group editor in the drawer — adds visual complexity for an action the user can already do from the session page; rejected for v1.

### 7. Cap is global and counts entries

**Decision**: `PIN_LIMIT = 5` stays unchanged and counts total `PinnedSessionEntry` rows across all groups. A user with `client-x: 2 pins, docs: 2 pins, Ungrouped: 1 pin` is at the cap; the 6th `add` (any group) returns 409 `pin_limit_reached`.

**Rationale**: The user explicitly chose "stay at globally." Counting entries rather than distinct sessions is the simpler, more conservative interpretation of the cap — it matches the existing 409 contract and avoids surprising users who have one session in many groups.

**Alternatives considered**:
- Cap counts distinct `sessionId` — more permissive, but breaks the mental model that 5 means 5 chips in the parallel view.
- Per-group cap with no global cap — rejected by the user.

## Risks / Trade-offs

- **Cap eats into multi-group use** → A session in 3 groups consumes 3 of 5 slots. The 5-cap message in the help system should explicitly call this out so users aren't surprised. Mitigation: the cap error surfaces the limit; the chips next to the checkbox make the per-group consumption visible while pinning.

- **`"Ungrouped"` is a magic string in the UI** → Users may rename-by-typing their way out of it (e.g. delete all groups and re-pin) but the literal still appears in the chip toolbar if any pin is ungrouped. Mitigation: treat it as just another group; if a future change wants to hide it, the only change is the chip-rendering condition.

- **Backward compat depends on the YAML parser behavior** → If a future js-yaml upgrade changes how missing fields are parsed, the coercion to `"Ungrouped"` must still apply. Mitigation: coerce inside `read()` after `load()`, not in the parser; the existing test for `entries: undefined` covers the boundary.

- **URL `?group=` is a free string, not an id** → Two semantically-equal names (`client-x` vs `Client-X`) create two separate groups because group identity is the literal string. Mitigation: case-insensitive equality in the chip-rendering dedup (chips for `client-x` and `Client-X` would render as one chip with the first-seen casing), and document the rule in the spec.

- **Drawer selection + group filter compose** → `?ids=…&group=…` means the user can ask for "group=client-x AND selected in drawer," which is fine but may surprise users who forget the drawer state persists in the URL. Mitigation: the `?ids=` param is only set by the drawer footer, so the typical flow is `/pinned?group=…` (no `?ids=`, all pins of the group shown).

## Migration Plan

No data migration. The on-disk format gains a new field; readers that lack it (old code, old files) treat it as `"Ungrouped"`. Writers always emit it. Rollout: ship the change behind no flag — the new field is additive and the default value matches the legacy behavior. Rollback: revert the code; old code reading new files ignores the unknown `group` field (the YAML library tolerates extra fields, and the JS interface will simply lack the property, defaulting to `"Ungrouped"` via the new coercion layer if the rollback is to a version that still has the coercion).

## Open Questions

- Should the typeahead match existing group names case-insensitively (and use the stored casing for the new entry) or treat the typed name verbatim? Current intent: verbatim; the spec will say "the typed name is the stored group label" and case-insensitive matching is only for the chip-dedup display.
- When a chip is removed (`×`) and the session is left with zero groups, should the pin be auto-unpinned (remove all `(sessionId, group)` rows) or should the session remain pinned with the implicit `"Ungrouped"` group? Current intent: remove all rows; the checkbox reflects "is this session pinned in any group?" and unchecking it is the explicit way to leave the group-less state. Confirm during implementation.
