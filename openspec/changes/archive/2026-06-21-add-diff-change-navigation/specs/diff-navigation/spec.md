# Spec: Diff Change Navigation

## Requirement: A change overview track shows where changes are

The system SHALL render a marker track alongside each scrollable diff, drawing one
colored tick per change hunk at a position proportional to the hunk's location in
the file.

### Scenario: Two small edits in a long file

- **GIVEN** a diff of a 300-line file with one change near the top and one near the bottom
- **WHEN** the diff is displayed
- **THEN** the overview track shows two ticks
- **AND** the top tick sits near the top of the track and the bottom tick near the bottom
- **AND** added hunks are green, removed hunks are red, and hunks containing both are shown as mixed

### Scenario: Consecutive changed lines collapse into one hunk

- **GIVEN** a single contiguous insertion of 40 lines
- **WHEN** the diff is displayed
- **THEN** the track shows exactly one tick for that insertion
- **AND** the tick is no shorter than the minimum tick height

### Scenario: No changes

- **GIVEN** a diff with no added or removed lines
- **WHEN** the diff is displayed
- **THEN** the track shows no ticks
- **AND** the change counter reads `0 / 0`

## Requirement: Clicking a tick scrolls to its hunk

The system SHALL scroll the diff so the corresponding hunk is brought into view
when a tick is clicked.

### Scenario: Jump to a hunk by clicking its tick

- **GIVEN** a diff with a hunk that is currently scrolled out of view
- **WHEN** the user clicks that hunk's tick on the overview track
- **THEN** the diff scrolls so the hunk is visible within the viewport

## Requirement: A viewport thumb shows the current scroll position

The system SHALL render a thumb on the overview track representing the currently
visible portion of the diff, and update it as the diff scrolls.

### Scenario: Thumb tracks scrolling

- **WHEN** the user scrolls the diff
- **THEN** the thumb on the overview track moves to reflect the new scroll position

## Requirement: Keybindings jump to next/previous change

The system SHALL provide configurable `nextChange` and `previousChange`
keybindings that scroll the next or previous hunk into view, defaulting to
`Alt+Shift+ArrowDown` and `Alt+Shift+ArrowUp`.

### Scenario: Jump to next change

- **GIVEN** a diff with multiple hunks and the first hunk in view
- **WHEN** the user presses `nextChange`
- **THEN** the diff scrolls so the next hunk is in view
- **AND** the change counter advances (e.g. `2 / 7`)

### Scenario: Wrap around at the ends

- **GIVEN** the last hunk is the current change
- **WHEN** the user presses `nextChange`
- **THEN** the diff scrolls to the first hunk
- **AND** the counter shows `1 / N`

### Scenario: Bindings are context-gated

- **GIVEN** the user is typing in the chat input
- **WHEN** the user types text
- **THEN** the change-navigation bindings do not intercept the keystrokes

### Scenario: Bindings are user-configurable and discoverable

- **GIVEN** a user override is provided via `window.MIMO_SESSION_KEYBINDINGS`
- **THEN** the configured keys are used instead of the defaults
- **AND** `nextChange` / `previousChange` appear in the shortcuts-help overlay

## Requirement: Navigation works on the PatchBuffer diff

The system SHALL render the overview track and support change navigation on the
PatchBuffer vertical-split diff.

### Scenario: Single shared track for the split view

- **GIVEN** a PatchBuffer showing a file with removed lines on the left and added lines on the right
- **WHEN** the diff is displayed
- **THEN** one overview track is shown covering both panes
- **AND** ticks reflect both the removed and added hunks

### Scenario: Panes stay aligned while scrolling

- **GIVEN** a PatchBuffer diff where the original and patched sides have different line counts
- **WHEN** the user scrolls one pane
- **THEN** the other pane stays aligned to the same logical rows without drifting

## Requirement: Navigation works in the commit dialog

The system SHALL render a per-file overview track and support change navigation for
each file's diff in the commit dialog.

### Scenario: Each file gets its own track

- **GIVEN** the commit dialog shows diffs for two files
- **WHEN** the diffs are displayed
- **THEN** each file's diff has its own overview track and change counter

### Scenario: Keys navigate within the active file

- **GIVEN** a file's diff is the active diff in the commit dialog
- **WHEN** the user presses `nextChange`
- **THEN** the next hunk within that file is scrolled into view
