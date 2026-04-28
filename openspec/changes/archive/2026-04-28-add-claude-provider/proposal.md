## Why

mimo-agent is hardcoded to use opencode as its ACP provider. The `@agentclientprotocol/claude-agent-acp` package (published April 2026) provides a drop-in ACP-compatible agent backed by the Claude Agent SDK, making it possible to add Claude as a first-class alternative with minimal changes.

## What Changes

- Add `--provider` CLI flag to mimo-agent (values: `opencode` | `claude`, default: `opencode`)
- New `ClaudeAgentProvider` implementing the existing `IAcpProvider` interface
- Add `@agentclientprotocol/claude-agent-acp` as a dependency of mimo-agent
- Provider is selected at agent startup — no platform or session model changes needed

## Capabilities

### New Capabilities

- `claude-provider`: ACP provider that spawns `claude-agent-acp` and communicates with it using the standard ACP protocol, supporting model/mode selection and streaming updates

### Modified Capabilities

- `agent-lifecycle`: The agent startup now accepts a `--provider` flag that determines which ACP provider is instantiated

## Impact

- **mimo-agent**: new file `src/acp/providers/claude-agent.ts`, changes to `src/index.ts` (arg parsing + provider selection), `package.json` (new dep)
- **mimo-platform**: no changes
- **Session/Agent data model**: no changes
- **Dependencies**: adds `@agentclientprotocol/claude-agent-acp` (Apache-2.0)
- **Auth**: requires `ANTHROPIC_API_KEY` env var set in the environment where mimo-agent runs
