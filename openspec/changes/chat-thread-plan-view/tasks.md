## 1. Agent: map and forward the ACP `plan` update

- [x] 1.1 Write a failing test for `claude-agent.ts` `mapUpdateType("plan")` returning `"plan"`
- [x] 1.2 Add `plan: "plan"` to `mapUpdateType` in `packages/mimo-agent/src/acp/providers/claude-agent.ts`
- [x] 1.3 Add best-effort `plan: "plan"` mapping to `packages/mimo-agent/src/acp/providers/opencode.ts`
- [x] 1.4 Write a failing test for `client.ts` `handleSessionUpdate`: a `plan` update invokes a new `onPlan(sessionId, entries)` callback with the entries
- [x] 1.5 Add the `onPlan` callback to the ACP client callbacks interface and a `case "plan"` in `handleSessionUpdate` that forwards `update.entries` in `packages/mimo-agent/src/acp/client.ts` (also wired the agent→platform `plan` message in `index.ts` `buildAcpCallbacks` + noop stub)
- [x] 1.6 Run `cd packages/mimo-agent && bun test` and confirm new tests pass

## 2. Platform: per-thread plan state in the streaming pipeline

- [x] 2.1 Write failing tests for a `planByThread` store: a `plan` update for a prompt is stored under the resolved `chatThreadId`; a second update replaces entries entirely; an unresolvable update is dropped
- [x] 2.2 Add `planByThread: Map<chatThreadId, PlanEntry[]>` to the streaming pipeline and a `handlePlan` path (router resolves the thread from the message `chatThreadId`, fallback to active chat thread) and overwrites entries
- [x] 2.3 Add a `plan` handler to the agent message router that dispatches plan updates into the pipeline
- [x] 2.4 Write a failing test that `buildAndClearAssistantContent` output never contains plan entries; confirm the saved message excludes the plan
- [x] 2.5 Add a per-thread plan accessor `getThreadPlan(sessionId, threadId)` on the pipeline

## 3. Platform: lifecycle (keep-last-snapshot, clear-on-session-clear)

- [x] 3.1 Write a failing test: plan persists in the pipeline after turn completion (not wiped at turn end)
- [x] 3.2 Write a failing test: clearing the session/thread removes the thread's stored plan
- [x] 3.3 Wire the session-clear flow (`handleAcpThreadCleared`) to wipe the affected thread's plan via `clearThreadPlan`
- [x] 3.4 Resolved open question: wipe the thread plan on a reset thread creation (`handleAcpThreadCleared` + `wasReset` branch of `handleAcpThreadCreated`); tests added

## 4. Platform: deliver the plan to clients

- [x] 4.1 Idle-availability behavior covered by the pipeline keep-last-snapshot test (`getThreadPlan` returns after turn end); the ws send mirrors the already-tested `available_commands` replay
- [x] 4.2 Send a per-thread `plan` snapshot on client connect and on `request_state` (thread switch) via `getThreadPlan`, even when no turn is streaming (`websocket/handlers.ts`)
- [x] 4.3 Live `plan` broadcast scoped to `chatThreadId` covered by pipeline test "broadcasts a live plan message scoped to the chat thread"
- [x] 4.4 `pipeline.handlePlan` broadcasts a per-thread `plan` message whenever `planByThread` is updated

## 5. Frontend: the Plan right-frame buffer

- [x] 5.1 Create `PlanBuffer` (server-rendered shell with `#plan-content` + empty state + status/priority styles); live entries rendered client-side by `chat.js`
- [x] 5.2 Register the buffer (`id: "plan"`, `name: "Plan"`, `frame: "right"`) in `buffers/index.ts`, sibling to `mcp-servers`
- [x] 5.3 N/A — `Frame` renders every registered buffer and passes `sessionId`/`isActive`; the Plan buffer's data is live (websocket), so no server `bufferProps` entry is needed
- [x] 5.4 Handle `plan` websocket messages in `public/js/chat.js` (`handlePlan` renders status/priority via `textContent`), filter by active `chatThreadId`, and clear the view on thread switch (`prepareThreadSwitch`)

## 6. Verification

- [x] 6.1 Unit suites green: mimo-agent 168 pass / 0 fail; mimo-platform — all suites touching changed files (router, pipeline, streaming-state, plan, buffers, frontend) 89+ pass / 0 fail. Remaining full-suite failures are pre-existing/flaky env tests (git-commit bootstrap, edit-buffer, timeout-bound Impact/Session-Priority) unrelated to this change. Integration `test.full` needs external binaries (claude-agent-acp/opencode/git server) not available here.
- [ ] 6.2 Manual probe with a real Claude session (requires running agent/server — not started per AGENTS.md): confirm a multi-step prompt populates the Plan tab live, the plan persists after the turn, switching threads shows per-thread plans, and the plan never appears in saved chat history
- [x] 6.3 Formatted via `bun prettier . --write`; no-plan-in-history guaranteed by the pipeline unit test "never persists plan entries into saved assistant message content"
