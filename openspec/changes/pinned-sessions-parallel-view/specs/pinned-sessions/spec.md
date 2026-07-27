## ADDED Requirements

### Requirement: Per-user pinned session store

The system SHALL maintain an ordered list of pinned sessions per user, stored under the user's own data directory, capped at a maximum of 5 entries. Pins are personal and not shared with other users.

#### Scenario: Empty pin store

- **WHEN** a user with no pins requests their pinned sessions
- **THEN** system returns an empty ordered list

#### Scenario: Pin store is capped

- **WHEN** a user with 5 existing pins attempts to pin a 6th session
- **THEN** system rejects the request with a "Pin limit reached (5)" error
- **AND** the existing 5 pins are unchanged

#### Scenario: Pins persist across logins

- **WHEN** a user logs out and logs back in
- **THEN** system returns the same ordered pin list as before logout

### Requirement: Pin a session from the session page

The session page top-nav SHALL display a pin checkbox next to the session name and branch. Toggling it on pins the current session for the authenticated user; toggling it off unpins.

#### Scenario: Pin the current session

- **WHEN** the user checks the pin checkbox in the session page top-nav for session "refactor-auth" on branch "feature/x"
- **THEN** system adds `{sessionId, projectId}` to the front of the user's pin store
- **AND** the checkbox reflects the checked state

#### Scenario: Unpin the current session

- **WHEN** the user unchecks the pin checkbox for a previously pinned session
- **THEN** system removes the entry from the user's pin store
- **AND** the checkbox reflects the unchecked state

#### Scenario: Pin checkbox reflects existing state on load

- **WHEN** the session page loads for a session that is already pinned
- **THEN** the pin checkbox is rendered in the checked state

#### Scenario: Re-pinning an already-pinned session moves it to top

- **WHEN** the user pins a session that is already in their pin store
- **THEN** system moves that entry to the front of the ordered list
- **AND** no duplicate entry is created

### Requirement: Global pinned-sessions side menu

The layout SHALL render a top-left button (`[≡]`) visible on every authenticated page. Clicking it opens a drawer listing the user's pinned sessions, each showing the session title and branch.

#### Scenario: Open side menu from any page

- **WHEN** the user clicks the `[≡]` button in the top-nav
- **THEN** system opens the pinned-sessions drawer
- **AND** system fetches and renders the user's current pin list

#### Scenario: Each pinned entry shows title, branch, and selection checkbox

- **WHEN** the drawer renders a pinned session entry
- **THEN** the entry displays the session title and the session's branch (if any)
- **AND** the entry displays a selection checkbox that defaults to checked

#### Scenario: Click a pinned entry to jump

- **WHEN** the user clicks a pinned session entry's title/branch (not its checkbox) in the drawer
- **THEN** system navigates to that session's full session page (`/projects/:projectId/sessions/:sessionId`)
- **AND** the drawer closes

#### Scenario: Toggle entry selection

- **WHEN** the user toggles an entry's selection checkbox in the drawer
- **THEN** system records the checked/unchecked state for that entry
- **AND** the entry's pin-store membership is unchanged
- **AND** the "View selected in parallel" action reflects the number of currently-checked entries

#### Scenario: Empty drawer state

- **WHEN** the user opens the drawer and has no pinned sessions
- **THEN** system displays an empty-state message ("No pinned sessions yet")

#### Scenario: Stale pin reference

- **WHEN** the drawer fetches the pin list and a pinned session no longer exists
- **THEN** system renders a "session no longer exists" row with an unpin action
- **AND** clicking unpin removes the stale entry from the pin store

#### Scenario: Close drawer

- **WHEN** the user presses Escape or clicks outside the drawer while it is open
- **THEN** system closes the drawer without changing navigation

### Requirement: Parallel pinned-sessions view

The drawer SHALL provide a "View selected in parallel" action that navigates to a dedicated `/pinned` route. The action SHALL pass the set of currently-checked drawer entries so that `/pinned` renders only those sessions — not every pinned session. The `/pinned` page SHALL render one iframe per selected pinned session, laid out as horizontal columns of equal width.

#### Scenario: Navigate to parallel view with selected entries

- **WHEN** the user clicks "View selected in parallel" in the drawer with K entries checked (1 ≤ K ≤ 5)
- **THEN** system navigates to `/pinned` carrying the selected session ids
- **AND** system renders exactly K columns — one per selected pinned session
- **AND** pinned sessions that are not checked in the drawer are NOT rendered on `/pinned`

#### Scenario: Each column embeds a session

- **WHEN** the `/pinned` page renders with N selected pinned sessions
- **THEN** each column contains an `<iframe>` whose `src` is `/projects/:projectId/sessions/:sessionId?embed=1`
- **AND** the iframes are same-origin and share the user's auth cookie

#### Scenario: Empty parallel view

- **WHEN** the user navigates to `/pinned` with no pinned sessions (or with no entries selected)
- **THEN** system renders an empty-state page with a call to action ("Pin a session first" when no pins exist, or "Select at least one session to view in parallel" when pins exist but none are checked)
- **AND** no iframes are rendered

#### Scenario: Stale pin in parallel view

- **WHEN** the `/pinned` page resolves a selected pinned session that no longer exists
- **THEN** system renders a placeholder column with an "unpin" action instead of an iframe

### Requirement: Active-column focus indicator

The `/pinned` page SHALL visually highlight the column whose iframe currently holds keyboard focus.

#### Scenario: Focus moves to a column

- **WHEN** the user clicks into (or tabs into) an iframe in one of the columns
- **THEN** system applies a highlight class to that column's wrapper element
- **AND** any previously highlighted column loses the highlight

#### Scenario: No column focused on load

- **WHEN** the `/pinned` page loads
- **THEN** no column is highlighted until the user focuses an iframe

### Requirement: Pin limit is enforced

The system SHALL reject pin attempts that would exceed the configured maximum of 5 pinned sessions per user.

#### Scenario: Reject 6th pin

- **WHEN** a user with 5 pinned sessions sends a pin request for a 6th session
- **THEN** system returns a 409 Conflict with body `{"error":"pin_limit_reached","limit":5}`
- **AND** the pin store is unchanged

### Requirement: Pin CRUD via internal API

The system SHALL expose internal REST endpoints for pin management, scoped to the authenticated user.

#### Scenario: List pins

- **WHEN** the client sends `GET /api/internal/users/:userId/pinned-sessions`
- **THEN** system returns the ordered pin list with each entry resolved to `{sessionId, projectId, sessionTitle, branch}`

#### Scenario: Create pin

- **WHEN** the client sends `POST /api/internal/users/:userId/pinned-sessions` with body `{sessionId, projectId}`
- **THEN** system inserts the entry at the front of the ordered list (or moves it to front if already present)
- **AND** returns the updated ordered list

#### Scenario: Delete pin

- **WHEN** the client sends `DELETE /api/internal/users/:userId/pinned-sessions/:sessionId`
- **THEN** system removes the matching entry (if any) from the pin store
- **AND** returns 204 No Content

#### Scenario: Reorder pins

- **WHEN** the client sends `PUT /api/internal/users/:userId/pinned-sessions` with body `{order: ["sid1","sid2",...]}`
- **THEN** system rewrites the pin store order to match the provided list
- **AND** returns the updated ordered list

#### Scenario: Auth required

- **WHEN** an unauthenticated client sends any pin endpoint request
- **THEN** system returns 401 Unauthorized