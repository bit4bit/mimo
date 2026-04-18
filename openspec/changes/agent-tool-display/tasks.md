# Tasks: agent-tool-display

## Implementation Order

- [ ] 1. Add tool callback types to `IAcpCallbacks` in `mimo-agent/src/acp/types.ts`
      - `onToolCall(sessionId, tool)` - tool starts
      - `onToolCallUpdate(sessionId, update)` - tool progress/result
- [ ] 2. Add tool mapping in `opencode.ts` provider (`tool_call` → `tool_call`, `tool_call_update` → `tool_call_update`)
- [ ] 3. Add tool mapping in `claude-agent.ts` provider (same mappings)
- [ ] 4. Add tool event handlers in `client.ts` `handleSessionUpdate()` method
      - Handle `tool_call` case
      - Handle `tool_call_update` case
- [ ] 5. Wire tool callbacks in `mimo-agent/src/index.ts` to send tool messages
- [ ] 6. Add tool message forwarding in `mimo-platform/src/index.tsx`
- [ ] 7. Add `tool_call`/`tool_call_update` handlers in `chat.js` message switch
- [ ] 8. Implement tool state management (Map<toolCallId, ToolDisplayState>) in `chat.js`
- [ ] 9. Implement `renderToolCall()` function in `chat.js`
- [ ] 10. Integrate tool rendering into thought section in `chat.js`
- [ ] 11. Test tool display end-to-end

## File Changes

| # | File | Change |
|---|------|--------|
| 1 | `packages/mimo-agent/src/acp/types.ts` | Add `onToolStart`, `onToolEnd` to `IAcpCallbacks` |
| 2 | `packages/mimo-agent/src/acp/providers/opencode.ts` | Add tool mappings in `mapUpdateType()` |
| 3 | `packages/mimo-agent/src/acp/providers/claude-agent.ts` | Add tool mappings in `mapUpdateType()` |
| 4 | `packages/mimo-agent/src/acp/client.ts` | Add `tool_start`, `tool_end` cases in `handleSessionUpdate()` |
| 5 | `packages/mimo-agent/src/index.ts` | Add `onToolStart`, `onToolEnd` callbacks in AcpClient creation |
| 6 | `packages/mimo-platform/src/index.tsx` | Add case handlers for `tool_start`, `tool_end` |
| 7 | `packages/mimo-platform/public/js/chat.js` | Add handlers + `renderToolExecution()` |

## Verification

Run existing tests to ensure no regressions:
```bash
cd packages/mimo-agent && bun test
cd packages/mimo-platform && bun test
```

Manual verification: Send a prompt that triggers multiple tools (grep, read, bash), verify tool rows appear in thought section.