## Why

ACP agents emit a structured execution plan (`session/update` with `sessionUpdate: "plan"`) that reports what the agent intends to do and how far along it is. The Claude provider (`claude-agent-acp` 0.42.0) already emits these updates — verified in source via both the `TodoWrite` and `Task*` paths — but mimo silently discards them at `client.ts:260` because `mapUpdateType` has no `plan` entry. Users currently have no visibility into the agent's live progress through a multi-step task.

## What Changes

- Surface the ACP `plan` update instead of dropping it: add a `plan` mapping to the Claude provider's `mapUpdateType` (and best-effort to the opencode provider), and route it through the ACP client to a new callback.
- Maintain a per-`chatThreadId` in-memory plan: each `plan` update **replaces** the thread's entries entirely (per the ACP spec — "the Client MUST replace the current plan completely"). Keyed by chat thread, resolved from the prompt via the existing `currentPromptByThread` routing.
- Add a new **"Plan"** right-frame buffer (tab), registered as a sibling to the existing MCP tab via the frame-buffer registry. It renders the current thread's plan entries with status (`pending` / `in_progress` / `completed`) and priority (`high` / `medium` / `low`).
- Two delivery channels: (a) **snapshot on thread switch / buffer open** — switching chat threads shows that thread's current plan, available even when no turn is streaming; (b) **live push** — plan updates during an active turn push to the open buffer.
- Lifecycle: **keep-last-snapshot** — the plan is never auto-wiped; the next `plan` update overrides it; `clear-session` wipes it. The plan is **never persisted to chat message history** (no JSONL changes); it is in-memory state that survives thread switches, page reloads, and reconnects, and is lost only on server restart / idle-park.

## Capabilities

### New Capabilities
- `agent-plan-view`: per-chat-thread agent plan state derived from ACP `plan` updates — its replace-entirely lifecycle, in-memory keep-last-snapshot semantics (no history), clear-on-session-clear behavior, the snapshot-on-switch and live-push delivery channels, and the "Plan" right-frame buffer that renders entries by status and priority.

### Modified Capabilities
- `claude-provider`: the provider now maps the ACP `plan` session update (previously unmapped and therefore dropped) so plan entries reach the agent message router.

## Impact

- **mimo-agent**: `src/acp/providers/claude-agent.ts` (`mapUpdateType` adds `plan`), `src/acp/providers/opencode.ts` (best-effort `plan` mapping), `src/acp/client.ts` (`handleSessionUpdate` new `plan` case + new `onPlan` callback).
- **mimo-platform**: agent message router (new `plan` handler), `src/domain/sessions/streaming-pipeline.ts` (per-thread `planByThread` buffer + snapshot accessor; explicitly excluded from `buildAndClearAssistantContent` so it never reaches `saveMessage`), websocket handlers (live `plan` push + include plan in per-thread snapshot), `session-clear` flow (wipe thread plans).
- **Web frontend**: new `Plan` buffer component registered in `web/features/sessions/components/buffers/index.ts` next to `mcp-servers`; wired into `SessionDetailPage` right-frame `bufferProps`; websocket plan message handling in `public/js/chat.js`.
- **Dependencies**: none added — `@agentclientprotocol/sdk` already defines `PlanEntry` / `sessionUpdate: "plan"`.
- **Persistence / protocol**: no message-history (JSONL) schema change; no breaking changes. opencode plan emission is unverified in this tree (external binary) and is therefore best-effort.
