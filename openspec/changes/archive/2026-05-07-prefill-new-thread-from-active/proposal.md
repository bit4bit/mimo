## Why

When a user already has an active chat thread and clicks "+" to create a new one, they typically want a parallel thread with the same setup (same agent, model, and mode). Today they must re-select all three manually, which is repetitive friction.

## What Changes

- When `showCreateThreadDialog()` opens and an active thread exists, the agent dropdown is pre-selected to the active thread's `assignedAgentId`
- Agent capabilities are fetched eagerly on dialog open (instead of waiting for a manual agent change event), populating model and mode selects immediately
- The model and mode matching the active thread are pre-selected once capabilities load
- Name field stays empty — user must type a name
- Instructions field keeps current behavior (`window.MIMO_DEFAULT_INSTRUCTIONS`)
- If the active thread's agent is not in the online agents list, the form opens with no prefilling (current behavior preserved)

## Capabilities

### New Capabilities

- `new-thread-prefill`: Prefilling the create-thread form from the currently active thread's agent, model, and mode

### Modified Capabilities

<!-- none -->

## Impact

- `packages/mimo-platform/public/js/chat-threads.js` — `showCreateThreadDialog()` function only
- No API changes, no backend changes, no new dependencies
