## 1. Define tests first (BDD)

- [ ] 1.1 Add failing integration test: session page renders right-frame toggle control
- [ ] 1.2 Add failing integration test: toggle control collapses right frame and expands left frame
- [ ] 1.3 Add failing integration test: `Alt+Shift+Control+F` toggles right frame collapse/expand
- [ ] 1.4 Add failing integration test: collapsed state persists via `/sessions/:id/frame-state`
- [ ] 1.5 Add failing integration test: right-frame active buffer is preserved across collapse/expand
- [ ] 1.6 Add failing integration test: configured `sessionKeybindings.toggleRightFrame` overrides default

## 2. Extend frame-state model and API

- [ ] 2.1 Add `rightFrame.isCollapsed` with default normalization to `false`
- [ ] 2.2 Update frame-state update logic to support collapse toggling without breaking buffer switching
- [ ] 2.3 Keep `POST /sessions/:id/frame-state` backward-compatible for existing payloads

## 3. Implement session-page UI behavior

- [x] 3.1 Add collapse/expand button affordance for right frame (toggle in Frame tabBarActions + MCP Servers buffer header + restore button)
- [ ] 3.2 Add collapsed layout class and CSS behavior
- [ ] 3.3 Wire button and tab interactions to maintain existing frame switching semantics

## 4. Implement keyboard and config wiring

- [ ] 4.1 Add `toggleRightFrame` to keybinding defaults and config validation
- [ ] 4.2 Handle `Alt+Shift+Control+F` in `session-keybindings.js`
- [ ] 4.3 Add shortcut chip rendering for right-frame toggle in session shortcuts bar

## 5. Verify

- [ ] 5.1 Run `packages/mimo-platform` test suite and resolve regressions
