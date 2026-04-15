## 1. Add behavior tests first

- [x] 1.1 Add failing integration test that session settings page shows all creation fields (Session Name, Assigned Agent, Agent working directory, Local Development Mirror, Branch, MCP Servers, Session Type) with persisted values
- [x] 1.2 Add failing integration test that creation section is read-only (no editable controls for creation fields)
- [x] 1.3 Add failing integration test that fallback labels render exactly: `None`, `Repository root`, `Disabled`, `Not set`, `None attached`

## 2. Implement route and UI changes

- [x] 2.1 Update `GET /sessions/:id/settings` route to resolve assigned agent and MCP server display names and pass creation metadata props
- [x] 2.2 Update `SessionSettingsPage` to render read-only "Creation Settings" section and keep timeout controls in runtime section

## 3. Verify

- [ ] 3.1 Run `cd packages/mimo-platform && bun test` and confirm suite is green
