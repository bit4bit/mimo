## Context

The session keybindings system (`session-keybindings.js`) handles all keyboard shortcuts for the session detail page. For the "new thread" action, `openCreateThreadDialog()` finds `#create-thread-btn` and calls `.click()`, which triggers `showCreateThreadDialog()` in `chat-threads.js`. That function creates a new `<div id="create-thread-dialog">` and appends it to `document.body` unconditionally — each keypress stacks another modal on top.

The commit dialog and file finder already use a toggle pattern in `session-keybindings.js`: check state, call open or close accordingly. The new-thread keybinding should follow the same pattern.

## Goals / Non-Goals

**Goals:**
- Pressing the keybinding when the dialog is closed opens it
- Pressing the keybinding when the dialog is open closes it
- Prevent duplicate dialogs from any trigger path (keybinding or `+` button click)

**Non-Goals:**
- Changing the dialog's visual design or form fields
- Changing other keybinding behaviors
- Server-side changes

## Decisions

**Toggle logic lives in `openCreateThreadDialog()` (keybindings.js)**

This matches the existing pattern used for the commit dialog (`isCommitDialogOpen() ? closeCommitDialog() : openCommitDialog()`) and file finder (`isFileFinderOpen() ? closeFileFinder() : openFileFinder()`). The keybinding layer owns the open/close decision; the dialog module owns creation and removal.

Alternative considered: put toggle logic inside `showCreateThreadDialog()` itself. Rejected because it would make the `+` button click also toggle-close the dialog, which is unexpected UX for a button labeled `+`.

**Defensive guard in `showCreateThreadDialog()`**

A guard at the top of `showCreateThreadDialog()` returns early if `#create-thread-dialog` already exists. This is a safety net — not the primary toggle mechanism — that prevents duplicates from any call path.

The stable `id="create-thread-dialog"` on the dynamically created element serves as the contract between the two modules, consistent with how `#commit-dialog` is the contract for the commit dialog.

## Risks / Trade-offs

- [Risk] The `#create-thread-dialog` ID as a cross-module contract is implicit → Mitigation: already the established pattern in this codebase (`#commit-dialog`, `#clone-workspace-dialog`); no new pattern introduced.
- [Risk] The `+` button click when dialog is already open silently does nothing (guard returns early) → Mitigation: acceptable; `+` is not a close affordance and the dialog has a cancel button and backdrop click to close.
