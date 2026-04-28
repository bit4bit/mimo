## 1. Dependency

- [x] 1.1 Add `@agentclientprotocol/claude-agent-acp` to `packages/mimo-agent/package.json` dependencies (pin to `0.25.3`)
- [x] 1.2 Run `bun install` in `packages/mimo-agent` to update lockfile

## 2. ClaudeAgentProvider

- [x] 2.1 Create `packages/mimo-agent/src/acp/providers/claude-agent.ts` implementing `IAcpProvider`
- [x] 2.2 Implement `spawn(cwd)`: spawn `claude-agent-acp` with stdio pipes
- [x] 2.3 Implement `extractState(response)`: extract model/mode from `configOptions` (same logic as `OpencodeProvider`)
- [x] 2.4 Implement `setModel`: call `connection.setSessionConfigOption` with model configId
- [x] 2.5 Implement `setMode`: call `connection.setSessionConfigOption` with mode configId
- [x] 2.6 Implement `mapUpdateType`: map `agent_thought_chunk`, `agent_message_chunk`, `usage_update`; return `null` for all others
- [x] 2.7 Export `ClaudeAgentProvider` from `packages/mimo-agent/src/acp/index.ts`

## 3. Provider Selection in mimo-agent

- [x] 3.1 Add `provider` field to `AgentConfig` interface in `packages/mimo-agent/src/types.ts`
- [x] 3.2 Parse `--provider` flag in `parseArgs()` in `packages/mimo-agent/src/index.ts` (default: `"opencode"`)
- [x] 3.3 Validate `--provider` value; log error and exit with code 1 if unrecognized
- [x] 3.4 Instantiate the correct provider in `MimoAgent` constructor based on `config.provider`

## 4. Tests

- [x] 4.1 Write integration test: agent starts with `--provider claude`, spawns `claude-agent-acp`, session initializes and returns configOptions
- [x] 4.2 Write integration test: agent starts with `--provider opencode`, behavior unchanged
- [x] 4.3 Write integration test: agent starts with unknown `--provider` value, exits with non-zero code
