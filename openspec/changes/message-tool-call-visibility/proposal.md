## Why

On the session page, users can approve tool calls, but once the agent finishes the response there is no persistent record in the agent message box showing which tools were actually used in that turn. This makes debugging hard and reduces trust because users cannot quickly audit what happened after the approval card disappears.

## What Changes

- Capture tool-call metadata (approved and rejected/cancelled) during a response turn and attach it to the finalized assistant message.
- Persist tool-call summaries in chat history (`chat.jsonl`) via assistant message `metadata`.
- Render tool-call information directly inside the assistant message box in the session chat UI (both live and history), showing only the tool title by default.
- Allow users to unfold each tool item to see more details (decision status, kind, option, locations).
- Keep permission cards for approval flow, but add a durable post-response view tied to the resulting assistant message, including rejected/cancelled calls.

## Capabilities

### New Capabilities

- `message-tool-call-visibility`: Show tool-call details in assistant messages after the response completes.

### Modified Capabilities

- `tool-approval`: Extend approval flow output so approved and rejected/cancelled tool calls can be surfaced in message history.

## Impact

- `packages/mimo-platform/src/index.tsx`: track tool call decisions per session turn; attach `metadata.toolCalls` (with decision status) when saving assistant messages on `usage_update`.
- `packages/mimo-platform/src/sessions/chat.ts`: no schema migration needed; existing `metadata` field stores structured tool-call summaries.
- `packages/mimo-platform/src/buffers/ChatBuffer.tsx`: render tool-call summary block in assistant message cards for server-rendered history.
- `packages/mimo-platform/public/js/chat.js`: render tool-call summary block for live updates and replayed history.
- `packages/mimo-agent`: no protocol-breaking changes expected for first iteration.
