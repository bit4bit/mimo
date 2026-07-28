## ADDED Requirements

### Requirement: Pin entries carry a group

Each `PinnedSessionEntry` SHALL include a required `group: string` field. The group is the user-facing label the entry is filed under; it is stored verbatim in the user's typed casing. When a pin request omits `group`, the system SHALL default it to the literal string `"Ungrouped"`. When a pin is read from disk and the entry is missing a `group` field, the system SHALL coerce it to `"Ungrouped"` so legacy pin files remain readable.

#### Scenario: Pin request with explicit group

- **WHEN** the client sends `POST /api/internal/users/:userId/pinned-sessions` with body `{sessionId, projectId, group: "client-x"}`
- **THEN** system stores the entry with `group: "client-x"`

#### Scenario: Pin request without group defaults to Ungrouped

- **WHEN** the client sends `POST /api/internal/users/:userId/pinned-sessions` with body `{sessionId, projectId}` (no `group`)
- **THEN** system stores the entry with `group: "Ungrouped"`

#### Scenario: Legacy pin file without group field is readable

- **GIVEN** a `pinned-sessions.yaml` file containing entries that lack a `group` field
- **WHEN** the system reads the file in response to a list request
- **THEN** every entry is returned with `group: "Ungrouped"`
- **AND** the file is rewritten on the next write so all entries carry a `group` field

#### Scenario: Group is a free-form string

- **WHEN** the client pins a session with `group: "spike/q3 2026!"`
- **THEN** system stores the entry with that exact string as the group label
- **AND** the value is preserved across reads

### Requirement: A session may be pinned in multiple groups

The system SHALL allow the same `(sessionId, projectId)` pair to appear once per group. Adding an entry that already exists for the same `sessionId` AND the same `group` SHALL move the existing entry to the front without creating a duplicate. Adding an entry for a `sessionId` under a different `group` SHALL create a new entry. Uniqueness is therefore `(sessionId, group)`, not `sessionId` alone.

#### Scenario: Same session in two groups is allowed

- **GIVEN** the user has no pins
- **WHEN** the user pins session `s1` with `group: "client-x"`
- **AND** pins session `s1` with `group: "docs"`
- **THEN** system stores two entries: `{s1, p1, "client-x"}` and `{s1, p1, "docs"}`
- **AND** both appear in the user's pin list

#### Scenario: Re-pinning under the same group moves to front

- **GIVEN** the user has pins `[s1: client-x, s2: client-x, s3: docs]`
- **WHEN** the user pins `s3` with `group: "client-x"`
- **THEN** system stores the new ordering as `[s3: client-x, s1: client-x, s2: client-x, s3: docs]`
- **AND** the `s3: docs` entry is unchanged

#### Scenario: Re-pinning under the same group and same session does not duplicate

- **GIVEN** the user has pin `{s1, p1, "client-x"}`
- **WHEN** the user pins `s1` with `group: "client-x"` again
- **THEN** the entry count is still 1
- **AND** the entry is moved to the front of the list

### Requirement: Global pin cap is preserved across groups

The system SHALL continue to reject pin attempts that would exceed the configured maximum of 5 total entries, where "entries" is counted across all groups. A single session in N groups consumes N entries toward the cap.

#### Scenario: Cap counts entries across groups

- **GIVEN** the user has 5 pin entries spanning multiple groups (e.g. `client-x: 2`, `docs: 2`, `Ungrouped: 1`)
- **WHEN** the user attempts to pin any session under any group
- **THEN** system returns 409 Conflict with body `{"error":"pin_limit_reached","limit":5}`
- **AND** the existing 5 entries are unchanged

#### Scenario: Cap message surfaces the limit

- **WHEN** system rejects a pin attempt due to the cap
- **THEN** the response body's `limit` field is `5`

### Requirement: Filter pin list by group

`GET /api/internal/users/:userId/pinned-sessions` SHALL accept an optional `?group=<name>` query parameter. When `?group=` is present, the response SHALL contain only entries whose `group` equals the supplied value (case-insensitive comparison). When `?group=` is absent, the response SHALL contain all entries (current behavior). When `?group=` is empty or equals `"Ungrouped"` (case-insensitive), the response SHALL contain only entries with `group: "Ungrouped"`.

#### Scenario: List filtered by group

- **GIVEN** the user has pins `[s1: client-x, s2: client-x, s3: docs, s4: Ungrouped]`
- **WHEN** the client requests `GET /users/:userId/pinned-sessions?group=client-x`
- **THEN** system returns `[s1, s2]` (entries whose group equals `client-x` case-insensitively)

#### Scenario: List unfiltered returns all entries

- **GIVEN** the user has pins across groups
- **WHEN** the client requests `GET /users/:userId/pinned-sessions` with no query
- **THEN** system returns all entries (current behavior preserved)

#### Scenario: Filter is case-insensitive

- **GIVEN** the user has a pin with `group: "Client-X"`
- **WHEN** the client requests `GET /users/:userId/pinned-sessions?group=client-x`
- **THEN** system returns the entry

### Requirement: List response includes group

`PinListEntryResponse` SHALL include a `group: string` field on every entry. The value is the entry's stored group label in the user's typed casing.

#### Scenario: List response carries group

- **WHEN** the client requests `GET /users/:userId/pinned-sessions`
- **THEN** every entry in the response includes a `group` field

### Requirement: Group picker on the session page

The session page top-nav SHALL render, in addition to the existing pin checkbox, an inline group picker that becomes active when the checkbox is checked. The picker SHALL display one removable chip per group the session is currently pinned in, plus an `+ add group` control that opens a typeahead listing the user's existing groups (from any session) and accepting a new group name. Removing the last chip SHALL unpin the session (remove all `(sessionId, group)` rows for that session).

#### Scenario: Pinning a session adds a chip

- **WHEN** the user checks the pin checkbox on a session that has no pins
- **THEN** system adds a default chip with group `Ungrouped` (or the user's last-used group)
- **AND** the user can rename the chip via the `+ add group` typeahead before any network call is made

#### Scenario: Adding a second group to an already-pinned session

- **GIVEN** the session is currently pinned in `client-x`
- **WHEN** the user clicks `+ add group` and types `docs`
- **THEN** system creates a new pin entry `{sessionId, projectId, "docs"}`
- **AND** the picker now shows two chips: `client-x` and `docs`

#### Scenario: Removing a chip drops that group

- **GIVEN** the session is pinned in `client-x` and `docs`
- **WHEN** the user clicks the `×` on the `docs` chip
- **THEN** system deletes the `{sessionId, "docs"}` entry
- **AND** the `client-x` entry is unchanged

#### Scenario: Removing the last chip unpins the session

- **GIVEN** the session is pinned in exactly one group
- **WHEN** the user removes the last chip
- **THEN** system deletes that entry
- **AND** the pin checkbox renders unchecked

#### Scenario: Typeahead lists existing groups

- **WHEN** the user opens the `+ add group` typeahead
- **THEN** the typeahead lists every distinct group the user currently has in their pin store (sorted, deduplicated case-insensitively, displayed in the first-seen casing)

#### Scenario: Typeahead creates a new group

- **WHEN** the user types a name not present in the existing list and confirms
- **THEN** system creates the pin entry with the typed name as the group label

#### Scenario: Inline group picker is hidden in embed mode

- **WHEN** the session page renders with `?embed=1` (inside a `/pinned` iframe)
- **THEN** only the pin checkbox is rendered
- **AND** the inline group picker is suppressed

### Requirement: Group chip toolbar on the parallel view

The `/pinned` page SHALL render a row of rounded group chips in the toolbar, next to "Back to dashboard", plus an always-present `All` chip. The chip set is derived from the user's current pin list: one chip per group that has at least one entry, in addition to `All`. The active chip reflects the current `?group=` query (or `All` when no query is present). Clicking a chip navigates to `/pinned?group=<name>` (or `/pinned` for `All`). The chips compose with the existing `?ids=` selection query.

#### Scenario: Chip toolbar reflects user's groups

- **GIVEN** the user has pins across groups `client-x`, `docs`, and `Ungrouped`
- **WHEN** the user navigates to `/pinned`
- **THEN** the toolbar shows chips `All`, `client-x`, `docs`, `Ungrouped`
- **AND** `All` is the active chip (filled style)

#### Scenario: Clicking a chip filters the parallel view

- **WHEN** the user clicks the `client-x` chip
- **THEN** browser navigates to `/pinned?group=client-x`
- **AND** the parallel columns render only pins with `group: "client-x"`
- **AND** the `client-x` chip is now the active chip

#### Scenario: Empty group has no chip

- **GIVEN** the user has no pins in group `docs`
- **WHEN** the user navigates to `/pinned`
- **THEN** the toolbar does NOT show a `docs` chip
- **AND** navigating directly to `/pinned?group=docs` renders the empty-state ("Pin a session first" if no pins, or "Select at least one session" if filtered set is empty)

#### Scenario: `All` chip removes the group filter

- **WHEN** the user is on `/pinned?group=client-x` and clicks the `All` chip
- **THEN** browser navigates to `/pinned` (no `?group=` query)
- **AND** the parallel columns render all selected pins

#### Scenario: Chip navigation preserves `?ids=` selection

- **GIVEN** the user arrived at `/pinned?ids=s1,s2` from the drawer
- **WHEN** the user clicks the `client-x` chip
- **THEN** browser navigates to `/pinned?ids=s1,s2&group=client-x`
- **AND** the parallel columns render only the selected ids that also match the group filter

#### Scenario: Group filter drives the parallel column set

- **GIVEN** the user has pins `[s1: client-x, s2: client-x, s3: docs, s4: client-x]`
- **WHEN** the user navigates to `/pinned?group=client-x`
- **THEN** the parallel columns render `s1`, `s2`, `s4`
- **AND** `s3` is NOT rendered

### Requirement: Drawer shows group as a label

The pinned-sessions drawer SHALL display the entry's `group` as a small secondary label under the session title and branch on each row. The drawer is read-only for groups: it does not offer a per-entry group editor. All group changes happen on the session page.

#### Scenario: Drawer row shows group

- **WHEN** the drawer renders a pinned entry with `group: "client-x"`
- **THEN** the row displays the session title, the branch (if any), and the group label `client-x` below the title
- **AND** the entry's selection checkbox (for parallel-view selection) is unaffected by the group label

## MODIFIED Requirements

### Requirement: Pin CRUD via internal API

(The system SHALL expose internal REST endpoints for pin management, scoped to the authenticated user. The `CreatePinRequest` and `PinListEntryResponse` types carry a `group` field as specified in the ADDED requirements above. The list endpoint supports the `?group=` filter as specified above.)

#### Scenario: List pins (unchanged for no-filter case)

- **WHEN** the client sends `GET /api/internal/users/:userId/pinned-sessions` with no query
- **THEN** system returns the ordered pin list with each entry resolved to `{sessionId, projectId, sessionTitle, branch, group}`

#### Scenario: Create pin (now accepts group)

- **WHEN** the client sends `POST /api/internal/users/:userId/pinned-sessions` with body `{sessionId, projectId, group?}`
- **THEN** system inserts the entry at the front of the ordered list (or moves it to front if the same `(sessionId, group)` already exists)
- **AND** if `group` is omitted, the entry is stored with `group: "Ungrouped"`
- **AND** the response includes the updated ordered list with each entry's `group` populated

#### Scenario: Delete pin (now per group)

- **WHEN** the client sends `DELETE /api/internal/users/:userId/pinned-sessions/:sessionId?group=<name>`
- **THEN** system removes the entry matching `(sessionId, group)` (case-insensitive on group) if any
- **AND** returns 204 No Content
- **WHEN** the client sends `DELETE` without a `?group=` query
- **THEN** system removes every entry for that `sessionId` across all groups (unpin completely)

#### Scenario: Reorder pins

- **WHEN** the client sends `PUT /api/internal/users/:userId/pinned-sessions` with body `{order: ["sid1","sid2",...]}`
- **THEN** system rewrites the pin store order to match the provided list
- **AND** returns the updated ordered list

#### Scenario: Auth required

- **WHEN** an unauthenticated client sends any pin endpoint request
- **THEN** system returns 401 Unauthorized
