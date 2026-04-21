## 1. Implement context helper and gating

- [x] 1.1 Add `getActiveBufferContext()` and `isActiveLeftBuffer(id)` helpers in `session-keybindings.js`
- [x] 1.2 Gate chat-scoped branches (`newThread`, `nextThread`, `previousThread`) on `isActiveLeftBuffer("chat")`
- [x] 1.3 Gate edit-scoped branches (`openFileFinder`, `closeFile`, `reloadFile`, `nextFile`, `previousFile`, `toggleExpertMode`, `expertInput`, `moveFocusUp`, `moveFocusDown`, `centerFocus`, `increaseFocus`, `decreaseFocus`) on `isActiveLeftBuffer("edit")`, preserving existing `expertState.enabled` check where present
- [x] 1.4 Replace inline patches check with `isActiveLeftBuffer("patches")` for `approvePatch` and `declinePatch`
- [x] 1.5 Verify global branches (`commit`, `projectNotes`, `sessionNotes`, `shortcutsHelp`, `closeModal`, `nextLeftBuffer`, `previousLeftBuffer`, `toggleRightFrame`) are NOT gated
- [x] 1.6 Preserve state-based ungated behavior for `Escape` (closes file finder by finder-open state; closes commit dialog by dialog-open state)

## 2. Verify

- [x] 2.1 Run `cd packages/mimo-platform && bun test` — no new failures introduced by this change (the 6 pre-existing failures are in unrelated suites: agent bootstrap, commits, VCS, session-impact UI; none touch `session-keybindings.js`)
- [ ] 2.2 Manual browser check: all scenarios in `specs/session-keybindings/spec.md` pass

## 3. Testing notes

Automated integration tests for the browser `keydown` dispatcher are not added here. The `mimo-platform` package has no DOM-emulation test dependency (no `happy-dom`, `jsdom`, etc.), and the sibling `session-page-keybindings-help` change similarly deferred its integration tests. The helper is a thin `document.querySelector` wrapper whose correctness is verifiable by inspection and manual browser run; the gating decision in each branch is visible at the branch head. If DOM-emulation is added to this package later, tests in `test/session-keybindings.test.ts` should cover the scenarios listed in the spec delta.
