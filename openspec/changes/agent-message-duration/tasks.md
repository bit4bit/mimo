## 1. Platform: track message start time

- [ ] 1.1 In `packages/mimo-platform/src/index.tsx`, add `const messageStartTimes = new Map<string, number>();` alongside `streamingBuffers` and `thoughtBuffers` (line ~101)
- [ ] 1.2 In the `thought_start` case of `handleAgentMessage`, add `messageStartTimes.set(startSessionId, Date.now())` before forwarding to clients
- [ ] 1.3 In the `message_chunk` case, add `if (!messageStartTimes.has(msgSessionId)) { messageStartTimes.set(msgSessionId, Date.now()); }` before accumulating the chunk

## 2. Platform: compute duration and persist on usage_update

- [ ] 2.1 In the `usage_update` case, read `const startMs = messageStartTimes.get(usageSessionId)` before the save block
- [ ] 2.2 Compute `durationMs` and `duration` string (`Nm Ns` format) when `startMs` exists
- [ ] 2.3 Delete `messageStartTimes.delete(usageSessionId)` after computing
- [ ] 2.4 When `hasBufferedAssistantOutput` is true, pass `metadata: { duration, durationMs }` (if computed) into the `saveMessage` call
- [ ] 2.5 Add `duration` (string) and `durationMs` (number) to the `usage_update` broadcast payload when duration was computed

## 3. ChatBuffer: show duration in SSR history header

- [ ] 3.1 In `packages/mimo-platform/src/buffers/ChatBuffer.tsx`, update the local `ChatMessage` interface to add `metadata?: Record<string, unknown>`
- [ ] 3.2 In the message list render, for `role === "assistant"`, if `msg.metadata?.duration` exists, add a `<span>` with `font-size: 0.75em; color: #888; margin-left: 8px;` showing `${duration} · ${new Date(msg.timestamp).toLocaleString()}`

## 4. Chat JS: track start time and display duration (live)

- [ ] 4.1 In `packages/mimo-platform/public/js/chat.js`, add `startTime: null` to `ChatState.streaming`
- [ ] 4.2 In `handlePromptReceived`, set `ChatState.streaming.startTime = Date.now()`
- [ ] 4.3 In `handleThoughtStart`, set `ChatState.streaming.startTime = Date.now()` only if `ChatState.streaming.startTime === null`
- [ ] 4.4 Add a pure service function `formatDuration(ms)` that returns `${Math.floor(ms/60000)}m${Math.floor((ms%60000)/1000)}s`
- [ ] 4.5 In `finalizeMessageStream(duration)`, before nullifying `messageElement`, if `duration` is set, insert a `<span class="message-meta">` with `font-size: 0.75em; color: #888; margin-left: 8px;` containing `${duration} · ${new Date().toLocaleString()}` into the message header after the "Agent" label
- [ ] 4.6 Reset `ChatState.streaming.startTime = null` in both `finalizeMessageStream` and `removeStreamingMessage`

## 5. Chat JS: cumulative duration total in footer status bar

- [ ] 5.1 Add `totalDurationMs: 0` to `ChatState` (top-level, not inside `streaming`)
- [ ] 5.2 Update `handleWebSocketMessage` `usage_update` case to pass `data.duration` and `data.durationMs` to `handleUsageUpdate(usage, duration, durationMs)`
- [ ] 5.3 Update `handleUsageUpdate(usage, duration, durationMs)`: if `durationMs` is a positive number, add it to `ChatState.totalDurationMs`; pass `duration` to `finalizeMessageStream(duration)`
- [ ] 5.4 In `updateUsageDisplay(usage)`: replace the existing early-return-on-null guard with: if `!usage && ChatState.totalDurationMs === 0` then hide the container and return; otherwise ensure the container is visible; prepend `Duration: ${formatDuration(ChatState.totalDurationMs)}` to the display string before `Cost:` when `ChatState.totalDurationMs > 0`
- [ ] 5.5 In `loadChatHistory`, declare a `let lastUsageCost = null` local variable; assign it each time a `parsed.type === "usage"` record is encountered; after the loop ends, sum `metadata.durationMs` from all raw assistant messages in the `messages` array into `ChatState.totalDurationMs`; call `updateUsageDisplay(lastUsageCost)` once so the footer shows the seeded total

## 6. Chat JS: show duration in history (renderMessage)

- [ ] 6.1 In `renderMessage(message)`, if `message.role === "assistant"` and `message.metadata?.duration` exists, insert a `<span class="message-meta">` into the header showing `${message.metadata.duration} · ${new Date(message.timestamp).toLocaleString()}`

## 7. Verification

- [ ] 7.1 Send a message with the agent connected; confirm the finalized Agent bubble header shows `Nm Ns · <datetime>`
- [ ] 7.2 Confirm the `#chat-usage` footer shows `Duration: Nm Ns | Cost: $X.XXXX | ...` after the first response
- [ ] 7.3 Send a second message; confirm the footer duration is the cumulative sum of both responses, not just the last one
- [ ] 7.4 Reload the page; confirm the history renders the same duration/datetime in each Agent message header
- [ ] 7.5 Reload the page; confirm the `#chat-usage` footer shows the cumulative total duration seeded from history (not 0)
- [ ] 7.6 Inspect `chat.jsonl`; confirm the assistant entry contains `"metadata":{"duration":"...","durationMs":...}`
- [ ] 7.7 Trigger a response with no `thought_start` (provider that skips it); confirm duration still appears (set from `message_chunk`)
- [ ] 7.8 Confirm user and system messages are unaffected (no meta span)
