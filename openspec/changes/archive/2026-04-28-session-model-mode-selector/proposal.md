# Proposal: Session Model and Mode Selector

## Why

Users need to manually select which LLM model and operational mode to use for each session. Currently, the mimo-agent doesn't expose the model/mode configuration options that the opencode ACP server provides via `configOptions`. This limits user control over their AI assistant's behavior and capabilities. The opencode ACP server returns available models and modes in the `configOptions` array after session creation, but mimo-agent currently ignores these, leaving users with no way to switch between different models or operational modes mid-session.

## What Changes

- Add model and mode selector dropdowns to the Session Detail page UI header
- Capture `configOptions` from ACP `NewSessionResponse` in mimo-agent (find by category: "model" and "mode")
- Forward model/mode state from mimo-agent to mimo-platform via WebSocket on session initialization
- Store model/mode state in-memory per-session (no database persistence required)
- Handle user-initiated model/mode changes via dropdown selection
- Forward model/mode change requests to ACP via `setSessionConfigOption` method
- Default to first available option when session is created
- Support flat and grouped option lists from ACP config options

## Capabilities

### New Capabilities
- `session-model-selector`: UI component and WebSocket handling for selecting LLM models from available options provided by the ACP server
- `session-mode-selector`: UI component and WebSocket handling for selecting operational modes (explore, code, review, etc.) from available options

### Modified Capabilities
- None (this is purely additive functionality)

## Impact

- **mimo-platform** (`SessionDetailPage.tsx`, `chat.js`): Add dropdown selectors to session header, WebSocket message handlers for model/mode state updates
- **mimo-agent** (`src/index.ts`): Extract `configOptions` from `NewSessionResponse`, forward to platform via WebSocket, handle change requests from platform
- **WebSocket Protocol**: New message types: `session_initialized`, `model_state`, `mode_state`, `set_model`, `set_mode`
- **Dependencies**: ACP SDK `@agentclientprotocol/sdk` for `SessionConfigOption`, `SetSessionConfigOptionRequest` types
- **Breaking Changes**: None - entirely additive
