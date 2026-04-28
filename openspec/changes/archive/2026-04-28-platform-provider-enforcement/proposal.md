## Why

Currently, mimo-agent accepts a `--provider` flag but there's no enforcement that the agent uses the provider intended by the platform. This allows agent identity drift where the same token can be used with different providers on different runs, making it impossible to run multiple mimo-agent instances with different providers while ensuring each agent honors its designated provider.

## What Changes

- **mimo-platform**: Add `provider` field to Agent model (required, "opencode" or "claude")
- **mimo-platform**: Include `provider` claim in JWT token payload when generating agent tokens
- **mimo-agent**: Make `--provider` flag required (no default)
- **mimo-agent**: Validate declared provider matches token's embedded provider on startup
- **mimo-agent**: Exit with code 1 and clear error message if providers don't match

## Capabilities

### New Capabilities
- `agent-provider-enforcement`: Platform-authoritative provider validation that ensures agents can only run with the provider they were created for

### Modified Capabilities
- `agents`: Add `provider` field to Agent model and include it in JWT token generation

## Impact

- Agent creation UI/API will require selecting a provider
- Agent startup sequence changes (validation before WebSocket connection)
- Existing agents without provider field need migration strategy or backward compatibility
- JWT tokens will be slightly larger (provider claim added)

**BREAKING**: Agents started without `--provider` flag will fail to start
