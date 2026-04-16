## 1. Define tests first (BDD)

- [ ] 1.1 Add failing integration test: `Mod+Shift+N` opens create-thread dialog
- [ ] 1.2 Add failing integration test: `Mod+Shift+ArrowRight` and `Mod+Shift+ArrowLeft` switch active thread
- [ ] 1.3 Add failing integration test: `Mod+Shift+M` opens commit dialog
- [ ] 1.4 Add failing integration test: `Mod+Shift+,` focuses Project Notes and `Mod+Shift+.` focuses Session Notes
- [ ] 1.5 Add failing integration test: `Mod+Shift+/` opens help overlay and first-visit auto-help behavior
- [ ] 1.6 Add failing integration test: shortcuts ignored while typing in textarea/input

## 2. Implement session keybinding module

- [x] 2.1 Create `public/js/session-keybindings.js` with centralized key dispatcher
- [x] 2.2 Wire actions to existing UI controls (`#create-thread-btn`, thread tabs, `#commit-btn`, notes textareas)
- [x] 2.3 Add browser-safe matching (`event.key` + `event.code`) and scoped `preventDefault()`

## 3. Implement help overlay and auto-help

- [x] 3.1 Add shortcuts help overlay markup and styling on session page
- [x] 3.2 Add `Mod+Shift+/` toggle behavior and close controls
- [x] 3.3 Add first-visit auto-help persistence via `localStorage`
- [x] 3.4 Add hint UI for unrecognized `Mod+Shift+<key>` attempts

## 4. Integrate and verify

- [x] 4.1 Load `session-keybindings.js` from session page layout
- [x] 4.2 Ensure behavior works with chat, threads, commit, and notes scripts
- [ ] 4.3 Run mimo-platform test suite and fix regressions
