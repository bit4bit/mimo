## Context

mimo-agent is a Bun/TypeScript process that proxies the ACP protocol between mimo-platform (via WebSocket) and a local coding agent (via stdin/stdout). The ACP provider abstraction (`IAcpProvider`) already exists and is cleanly isolated — `OpencodeProvider` is the only implementation. The `@agentclientprotocol/claude-agent-acp` package (v0.25.3, Apache-2.0) ships a `claude-agent-acp` binary that speaks ACP over stdin/stdout, backed by the Claude Agent SDK. Its `newSession` response uses the same `configOptions` shape (category: `"model"` / `"mode"`) as opencode, making the integration straightforward.

## Goals / Non-Goals

**Goals:**
- Add `ClaudeAgentProvider` implementing `IAcpProvider`, spawning `claude-agent-acp`
- Add `--provider` CLI flag to mimo-agent for provider selection at startup
- Keep `opencode` as the default (no behavior change for existing users)

**Non-Goals:**
- Per-session provider switching (provider is fixed at agent startup)
- Platform UI changes or session model changes
- Managing `ANTHROPIC_API_KEY` — the user is responsible for setting it in their environment
- Supporting provider switching without restarting the agent

## Decisions

### `--provider` flag over a config file
A CLI flag is consistent with how mimo-agent is already configured (`--token`, `--platform`, `--workdir`). A config file would add complexity with no benefit at this stage.

### `ClaudeAgentProvider.setModel` / `setMode` use `setSessionConfigOption`
opencode uses custom `extMethod` calls (`session/set_model`, `session/set_mode`) because it predates the standard ACP config option mechanism. `claude-agent-acp` implements `setSessionConfigOption` natively, so we use that instead. The `AcpClient` already calls `provider.setModel` / `provider.setMode` — the provider encapsulates which wire call to make.

### `mapUpdateType` skips `tool_call_update` and others
`claude-agent-acp` emits additional update types (`tool_call_update`, `config_option_update`, `current_mode_update`) that opencode does not. Returning `null` from `mapUpdateType` for unknown types is the existing skip pattern — no changes to `AcpClient` needed.

### Single binary, provider selected at startup
The agent process selects a provider once in its constructor. This is the simplest model: one agent process = one provider. Users who want both providers run two separate agent processes.

## Risks / Trade-offs

- **`claude-agent-acp` binary must be installed** — if not on `PATH`, the agent fails at spawn time. Mitigation: surface a clear error message.
- **`ANTHROPIC_API_KEY` not set** — `claude-agent-acp` will fail on first prompt. Mitigation: out of scope for this change; handled by the user's environment.
- **Package is new (published April 2026)** — API may shift. Mitigation: pin to `0.25.3` in `package.json`.

## Migration Plan

No migration needed. Existing users get `--provider opencode` by default (unchanged behavior). To use Claude: install `claude-agent-acp` globally, set `ANTHROPIC_API_KEY`, restart mimo-agent with `--provider claude`.
