## Why

When the agent responds to a message, the user has no visibility into how long the agent took to produce that response. There is no timestamp visible on agent messages and no duration indicator. This makes it hard to understand agent performance, compare responses, or correlate a message with external events.

## What Changes

- The platform tracks when an agent message begins (on `thought_start`, or on the first `message_chunk` if no `thought_start` occurs) and when it ends (on `usage_update`).
- The elapsed time is formatted as `0m0s` and saved into the `metadata` field of the `ChatMessage` stored in `chat.jsonl`, alongside the existing `timestamp`.
- The platform broadcasts the duration alongside the `usage_update` event so live chat clients receive it.
- The chat UI displays the duration and the datetime timestamp in the Agent message header — both during live streaming (finalized at `usage_update`) and when loading from history.
- The chat UI maintains a running total of all agent response durations for the session and displays it in the footer status bar (`#chat-usage`) to the left of the `Cost:` field, as `Duration: 0m0s`. The total is initialized from history on page load and incremented with each new `usage_update`.

## Capabilities

### New Capabilities

- `message-duration`: Track and display the elapsed duration of each agent response, in `0m0s` format, in the Agent message header and in the persistent chat history.

### Modified Capabilities

<!-- No existing capability specs are changed -->

## Impact

- `packages/mimo-platform/src/index.tsx`: add `messageStartTimes` map; record start on `thought_start` / first `message_chunk`; compute and attach duration on `usage_update` (persisted + broadcast)
- `packages/mimo-platform/src/sessions/chat.ts`: `metadata` field on `ChatMessage` already exists — no interface change required
- `packages/mimo-platform/src/buffers/ChatBuffer.tsx`: update local `ChatMessage` interface with `metadata`; render duration + timestamp in assistant message header
- `packages/mimo-platform/public/js/chat.js`: add `startTime` to `ChatState.streaming` and `totalDurationMs` to `ChatState`; record start on `handlePromptReceived` / `handleThoughtStart`; add `formatDuration(ms)` pure service; update `handleUsageUpdate` and `finalizeMessageStream` to display duration in message header; accumulate `totalDurationMs` on each `usage_update` and seed it from history on load; update `formatUsage` and `updateUsageDisplay` to show the running total as `Duration: 0m0s` to the left of `Cost:`; update `renderMessage` to show per-message duration from history metadata
- No HTTP API changes, no new dependencies, no DB schema changes
