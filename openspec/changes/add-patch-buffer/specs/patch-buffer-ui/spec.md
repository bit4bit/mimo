# Spec: PatchBuffer UI

## Requirement: PatchBuffer tab appears when a patch record exists

The system SHALL open a `Patch: <filename>` tab in the frame buffer area when a patch record is created for a file.

### Scenario: ExpertMode creates patch for calc.py
- **WHEN** ExpertMode successfully creates a backend patch record for `calc.py`
- **THEN** a new tab labeled `Patch: calc.py` appears next to the `Edit` tab
- **AND** the tab becomes active automatically
- **AND** the PatchBuffer diff view is rendered

### Scenario: Two files have pending patches
- **WHEN** patches exist for `calc.py` and `utils.py`
- **THEN** two patch tabs are visible: `Patch: calc.py` and `Patch: utils.py`
- **AND** each tab is independently selectable

---

## Requirement: PatchBuffer renders a vertical-split diff view

The system SHALL display the original file (left pane) and the patched file (right pane) side by side with change highlighting.

### Scenario: Render diff for a two-replacement patch
- **GIVEN** a patch record for `calc.py` with two replaced regions
- **WHEN** the PatchBuffer tab is active
- **THEN** the left pane shows the original content with removed lines highlighted in red and a red left border
- **AND** the right pane shows the patched content with added lines highlighted in green and a green left border
- **AND** unchanged lines are rendered without highlight
- **AND** syntax highlighting is applied to both panes using the file's detected language

### Scenario: Synchronized scrolling
- **WHEN** the user scrolls the left pane
- **THEN** the right pane scrolls to the same position
- **AND** vice versa

---

## Requirement: PatchBuffer survives browser reload

The system SHALL restore the diff view after a browser reload if the patch record still exists on the backend.

### Scenario: Reload with pending patch
- **GIVEN** a pending patch for `calc.py` in session `s1`
- **WHEN** the browser is reloaded
- **THEN** `GET /sessions/s1/patch-buffers/calc.py` returns the record
- **AND** the `Patch: calc.py` tab is re-opened and the diff view is restored

### Scenario: Reload after patch was already resolved
- **GIVEN** the patch for `calc.py` was approved before the reload
- **WHEN** the browser is reloaded
- **THEN** `GET /sessions/s1/patch-buffers/calc.py` returns 404
- **AND** no patch tab is shown

---

## Requirement: Approve applies changes and closes tab

The system SHALL write the patched content to disk and close the patch tab when the user clicks Approve.

### Scenario: User approves patch
- **WHEN** the user clicks Approve in the `Patch: calc.py` tab
- **THEN** `POST /sessions/s1/patch-buffers/calc.py/approve` is called
- **AND** the `Patch: calc.py` tab is closed
- **AND** focus returns to the Edit buffer showing `calc.py`
- **AND** the Edit buffer marks `calc.py` as outdated and reloads it

---

## Requirement: Decline discards patch and closes tab

The system SHALL delete the patch record without modifying the file and close the tab when the user clicks Decline.

### Scenario: User declines patch
- **WHEN** the user clicks Decline in the `Patch: calc.py` tab
- **THEN** `DELETE /sessions/s1/patch-buffers/calc.py` is called
- **AND** the `Patch: calc.py` tab is closed
- **AND** focus returns to the Edit buffer showing `calc.py`
- **AND** the file on disk is unchanged

---

## Requirement: Approve and Decline buttons are always visible

The system SHALL render Approve and Decline buttons in the PatchBuffer header bar, not inside the scrollable diff area.

### Scenario: Long diff with scrolling
- **GIVEN** a patch with many changed lines requiring scrolling
- **WHEN** the user scrolls down in either diff pane
- **THEN** the Approve and Decline buttons remain visible at the top of the buffer
