## 1. Add defensive guard in chat-threads.js

- [x] 1.1 At the top of `showCreateThreadDialog()` in `packages/mimo-platform/public/js/chat-threads.js`, add a guard: if `document.querySelector("#create-thread-dialog")` exists, return early

## 2. Add toggle logic in session-keybindings.js

- [x] 2.1 In `openCreateThreadDialog()` in `packages/mimo-platform/public/js/session-keybindings.js`, check if `#create-thread-dialog` exists in the DOM; if so, remove it and return `true` (toggle close)
- [x] 2.2 If no existing dialog, proceed with the existing `createButton.click()` logic (toggle open)

## 3. Verify behavior

- [x] 3.1 Confirm pressing the keybinding once opens the dialog
- [x] 3.2 Confirm pressing the keybinding again while dialog is open closes it
- [x] 3.3 Confirm pressing the keybinding rapidly multiple times never produces more than one dialog in the DOM
- [x] 3.4 Confirm clicking `+` button while dialog is already open does not create a duplicate
