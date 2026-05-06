## Why

When a chat thread is created with instructions (project/session/thread level), the system correctly saves the instructions as a system message and sends them to the agent as an `initial_prompt`. However, the agent's response to those instructions is **never displayed** to the user. This happens because the platform's streaming pipeline requires a `promptId` for all message chunks, but initial prompts don't generate one. The LLM's response is silently dropped by the `requirePromptId` check in `AgentMessageRouter`, leaving users confused about why they see their instructions but no acknowledgment from the agent.

## What Changes

- **Modify `handleInitialPrompt` in mimo-agent**: Generate a `promptId` for initial prompts and include it in message exchanges with the platform
- **Include `promptId` in `initial_prompt` message**: Send the generated `promptId` from platform to mimo-agent so both sides can track the conversation
- **Ensure streaming pipeline compatibility**: The existing `message_chunk`, `thought_chunk`, `usage_update`, and `prompt_completed` events will work with the new `promptId`

## Capabilities

### New Capabilities
<!-- No new capabilities - this is a bug fix -->

### Modified Capabilities
<!-- This is an internal implementation fix that doesn't change any external behavior or contracts -->

## Impact

- **Files Modified**:
  - `packages/mimo-agent/src/index.ts` - `handleInitialPrompt` method
  - `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx` - `initial_prompt` message structure
  
- **Behavior Change**: When creating threads with instructions, users will now see the agent's response (acknowledgment/helpful response) instead of just the system message

- **Breaking Changes**: None - this is a pure bug fix with no API changes
