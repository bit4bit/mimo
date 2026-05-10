## ADDED Requirements

### Requirement: New-thread keybinding toggles the dialog
The new-thread keybinding SHALL toggle the create-thread dialog: pressing it when the dialog is closed opens it; pressing it when the dialog is open closes it.

#### Scenario: Open dialog with keybinding
- **WHEN** the user presses the new-thread keybinding and no create-thread dialog is open
- **THEN** the create-thread dialog opens

#### Scenario: Close dialog with keybinding
- **WHEN** the user presses the new-thread keybinding and the create-thread dialog is already open
- **THEN** the create-thread dialog closes

#### Scenario: No duplicate dialogs from repeated keybinding
- **WHEN** the user presses the new-thread keybinding multiple times in rapid succession
- **THEN** only one create-thread dialog exists in the DOM at any time

### Requirement: Create-thread dialog is idempotent on open
The `showCreateThreadDialog` function SHALL be a no-op if a create-thread dialog already exists in the DOM, regardless of what triggered the call.

#### Scenario: Button click when dialog already open
- **WHEN** the create-thread dialog is open and the `+` button is clicked
- **THEN** no additional dialog is created
