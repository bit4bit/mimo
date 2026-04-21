## Why

ACP emits `available_commands_update`, but mimo-agent currently drops it before it reaches mimo-platform/UI. Users have no way to discover provider-supported slash commands from inside the session page, so command usage depends on memory or external docs.

## What Changes

- Stop filtering `available_commands_update` in the ACP provider mapping path.
- Forward command updates through mimo-agent with a dedicated event type (`available_commands_update`).
- Cache and broadcast available commands in mimo-platform by session/thread.
- Add session chat UI command discovery:
  - command list button near chat input
  - slash-triggered picker when user types `/`
  - insert selected command template into chat input (no auto-send)
- Keep this iteration display/insert only (no direct command execution API).

## Capabilities

### New Capabilities

- `session-command-discovery`: Discover and insert ACP-provided commands from the session chat input.

### Modified Capabilities

- `acp-chat-formatting`: Replace "filter commands update" behavior with "forward commands update for chat UX" behavior.

## Impact

- `packages/mimo-agent/src/acp/providers/opencode.ts`: map `available_commands_update` to a forwarded update type.
- `packages/mimo-agent/src/acp/client.ts`: parse command update payload and invoke callback.
- `packages/mimo-agent/src/index.ts`: emit `available_commands_update` messages to platform.
- `packages/mimo-platform/src/index.tsx`: handle/broadcast command updates and maintain in-memory command state per stream key.
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`: add command button and picker container near chat input.
- `packages/mimo-platform/public/js/chat.js`: render command list/picker and support insert-on-select.
