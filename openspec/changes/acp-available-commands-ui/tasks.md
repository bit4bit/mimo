## 1. Tests First (BDD)

- [x] 1.1 Update mimo-agent provider mapping test to assert `available_commands_update` is forwarded (not filtered).
- [x] 1.2 Add/extend mimo-agent ACP client test to assert command payload callback is invoked on `available_commands_update`.
- [ ] 1.3 Add/extend mimo-platform message-routing test to assert `available_commands_update` is cached and broadcast to session chat subscribers.
- [ ] 1.4 Add/extend session chat UI tests for command picker open/close behavior via button and `/` trigger.
- [ ] 1.5 Add/extend UI test to assert selecting a command inserts template into chat input and does not auto-send.

## 2. mimo-agent implementation

- [x] 2.1 In `packages/mimo-agent/src/acp/providers/opencode.ts`, map `available_commands_update` to a forwarded update type.
- [x] 2.2 In `packages/mimo-agent/src/acp/client.ts`, add command update callback contract and handler branch.
- [x] 2.3 In `packages/mimo-agent/src/index.ts`, wire callback and emit `{ type: "available_commands_update", ... }` to platform.
- [x] 2.4 Ensure unknown/malformed command payloads do not crash stream handling.

## 3. mimo-platform backend implementation

- [x] 3.1 In `packages/mimo-platform/src/index.tsx`, add handler for `available_commands_update` from agent.
- [x] 3.2 Keep latest available commands in memory per stream key (`sessionId + chatThreadId`).
- [x] 3.3 Broadcast command update payload to active chat WebSocket clients in that session/thread scope.

## 4. Session chat UI implementation

- [ ] 4.1 In `packages/mimo-platform/src/components/SessionDetailPage.tsx`, add command UI anchor near chat input.
- [x] 4.2 In `packages/mimo-platform/public/js/chat.js`, render command button/list and empty state.
- [x] 4.3 Add slash-triggered filtered picker behavior on `/` input.
- [x] 4.4 Insert selected command/template into chat input at cursor; keep send action manual.
- [x] 4.5 Keep command metadata out of persisted assistant/user chat transcript content.

## 5. Verification

- [x] 5.1 Run `cd packages/mimo-agent && bun test` and confirm suite is green.
- [ ] 5.2 Run `cd packages/mimo-platform && bun test` and confirm suite is green.
- [ ] 5.3 Manual: receive command update, open picker via button, insert a command, send prompt successfully.
- [ ] 5.4 Manual: type `/` in input and confirm filtered picker appears and updates as text changes.
- [ ] 5.5 Manual: confirm selected command insertion does not auto-send and no raw command-update event appears as assistant message.
