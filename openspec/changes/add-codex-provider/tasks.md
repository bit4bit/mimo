## 1. Dependencies & Configuration

- [x] 1.1 Add `@zed-industries/codex-acp` dependency to `packages/mimo-agent/package.json` (pin latest stable) and install
- [x] 1.2 Extend provider CLI parsing and validation to accept `codex`, updating error messaging and `AgentConfig` typing

## 2. Codex Provider Implementation

- [x] 2.1 Implement `CodexProvider` (spawn, extractState, setModel, setMode, mapUpdateType) under `src/acp/providers`
- [x] 2.2 Wire Codex provider into agent startup (provider map, session spawn, state persistence)

## 3. Test Coverage

- [x] 3.1 Extend provider selection Bun tests to cover `--provider codex`
- [x] 3.2 Add Codex provider unit tests for state extraction and update mapping behaviour

## 4. Documentation & Validation

- [x] 4.1 Update `packages/mimo-agent/README.md` (and related docs) with Codex provider instructions and credential requirements
- [x] 4.2 Smoke-test mimo-agent with `--provider codex` (spawn success, ACP initialization logs)
