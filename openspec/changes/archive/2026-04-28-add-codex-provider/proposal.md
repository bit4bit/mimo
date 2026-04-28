## Why

mimo-agent currently supports only the opencode and Claude ACP adapters. Teams relying on Codex through ACP-compatible clients must run a different agent, fragmenting workflows and preventing parity across providers.

## What Changes

- Add a `codex` provider option to mimo-agent’s CLI provider selection while leaving `opencode` as the default.
- Implement a `CodexProvider` that launches the `codex-acp` binary, translates session state, and maps streaming updates into mimo’s messaging schema.
- Pull in Codex-specific dependencies and documentation, including notes on required environment variables and binary availability.
- Extend provider selection and ACP state extraction tests to cover the Codex code paths.

## Capabilities

### New Capabilities
- `codex-provider`: mimo-agent can spawn the Codex ACP adapter, surface its model/mode configuration, and forward streaming updates.

### Modified Capabilities
- `agent-lifecycle`: Provider selection must recognise Codex as a first-class option during agent startup.

## Impact

- `packages/mimo-agent`: new provider implementation, CLI validation updates, additional tests, dependency updates.
- `packages/mimo-agent` documentation: provider matrix, setup instructions, credential requirements for Codex.
- Build/runtime environments must include the `codex-acp` binary (via npm install or release download) and necessary Codex credentials.
