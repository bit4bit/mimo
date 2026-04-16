## 1. Tests First (BDD)

- [ ] 1.1 Add/extend a platform test that proves approved tool calls are attached to assistant message metadata at turn finalization.
- [ ] 1.2 Add/extend a platform test that proves rejected/cancelled tool calls are persisted with decision status in assistant metadata.
- [ ] 1.3 Add/extend chat rendering tests to assert assistant message cards render tool titles in collapsed state when `metadata.toolCalls` exists.
- [ ] 1.4 Add/extend chat interaction tests to assert clicking a tool item unfolds details (decision, kind, option kind, locations when present).

## 2. Platform message pipeline

- [ ] 2.1 In `packages/mimo-platform/src/index.tsx`, extend pending permission state to retain `toolCall` and selected option metadata.
- [ ] 2.2 Add a per-session in-memory buffer of resolved tool call decisions for the current response turn.
- [ ] 2.3 On `permission_response`, map the outcome to decision status (`approved` / `rejected` / `cancelled`) and move the summary into the current turn buffer.
- [ ] 2.4 On `usage_update` assistant finalization, attach buffered decision summaries as `metadata.toolCalls` and clear the turn buffer.
- [ ] 2.5 Ensure turn buffers are cleared on error/cancel/disconnect paths to avoid cross-turn leakage.

## 3. Session chat UI

- [ ] 3.1 Update `packages/mimo-platform/src/buffers/ChatBuffer.tsx` to render a compact "Tools used" section in assistant cards with title-only collapsed rows.
- [ ] 3.2 Update `packages/mimo-platform/public/js/chat.js` message rendering so live and replayed messages show title-only collapsed rows and click-to-unfold details.
- [ ] 3.3 Add minimal styles for readability without disrupting existing message layout.

## 4. Verification

- [ ] 4.1 Run `cd packages/mimo-platform && bun test` and confirm the suite is green.
- [ ] 4.2 Manual flow: approve a tool call, wait for assistant response completion, confirm tool info appears in that assistant message box.
- [ ] 4.3 Reload the session page and confirm the same tool summary remains visible from persisted history.
- [ ] 4.4 Manual negative flow: deny/cancel tool approval and confirm the assistant message shows the tool summary with rejected/cancelled status.
- [ ] 4.5 Manual UI flow: confirm only tool title is visible by default, click unfold, and confirm details are shown.
