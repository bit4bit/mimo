## Context

ACP defines a `plan` session update: a full snapshot of plan entries (`content`, `priority`, `status`) that the agent replaces in its entirety on every emission ("the Client MUST replace the current plan completely"). The Claude provider already emits these — confirmed in `@agentclientprotocol/claude-agent-acp` 0.42.0, which normalizes both `TodoWrite` (snapshot) and `Task*` (accumulated state) into a single `sessionUpdate: "plan"` carrying the full entries list, and suppresses the corresponding `tool_call` events so plans arrive as a clean dedicated stream.

mimo discards these today: `mapUpdateType` in each provider has no `plan` key, so `client.ts:260` (`if (mappedType === null) return;`) drops them before any handler runs. Existing infrastructure we build on: `currentPromptByThread` (prompt→thread routing in the streaming pipeline), per-`chatThreadId` `streaming_state` websocket messages, `getStreamingSnapshot(sessionId, threadId)`, and the frame-buffer registry (`registerBuffer`) that already hosts the `mcp-servers` tab in the right frame.

## Goals / Non-Goals

**Goals:**
- Surface the agent's live plan as a per-chat-thread view in a "Plan" right-frame buffer beside the MCP tab.
- Show the correct thread's plan on thread switch, including when no turn is streaming.
- Push plan updates live to the open buffer during a turn.
- Keep it ephemeral: in-memory, never written to chat message history.

**Non-Goals:**
- Persisting plans across server restart / idle-park (acceptably lost).
- Editing or interacting with plan entries (read-only display).
- Verifying or guaranteeing opencode plan emission (best-effort mapping only).
- Embedding the plan inside the per-message "Thought Process" block (superseded — the plan is thread-level state, not message-level).

## Decisions

**D1 — Plan identity is the chat thread, not the prompt or the message.**
Store `planByThread: Map<chatThreadId, PlanEntry[]>` in the streaming pipeline. The plan represents "current state of work in this thread," so it must outlive a single turn and follow thread switches. Resolve the owning thread from the update's `promptId` via the existing `currentPromptByThread` map (falling back to the session's active chat thread if no mapping). Alternative considered: keying by `promptId` (ephemeral per-turn) — rejected because it dies at turn-end and can't satisfy "show on thread switch after the turn."

**D2 — Buffer pattern (fetch-on-open + live push), not `streaming_state` overload.**
The Plan buffer mirrors `McpServersBuffer`: it gets the current plan as a prop / snapshot when it mounts or the thread switches, then receives live updates via a dedicated websocket message while open. Rationale: `streaming_state` only fires while a turn is actively streaming (it is guarded on `thoughtContent || messageContent || promptInFlight`), but the plan must be visible when idle (keep-last-snapshot). Reusing `streaming_state` alone would leave the plan blank between turns. The per-thread snapshot accessor is extended to carry `planEntries` so connect/switch delivers it; a separate `plan` push handles live updates.

**D3 — In-memory, replace-entirely, no history.**
Each `plan` update overwrites the thread's entry list wholesale (never append) per the ACP spec. The plan is never added to assistant message content: `buildAndClearAssistantContent` ignores `planByThread`, so it never reaches `saveMessage` / the JSONL transcript. It survives thread switches, page reloads, and reconnects (server-side memory persists across client reloads) and is lost only on server restart or idle-park — an accepted trade-off.

**D4 — Provider mapping is the unblock; Claude is the verified path.**
Add `plan: "plan"` to `mapUpdateType` in `claude-agent.ts` (verified emitter) and, best-effort, in `opencode.ts`. `client.ts` `handleSessionUpdate` gains a `plan` case that invokes a new `onPlan(sessionId, entries)` callback; the platform message router adds a `plan` handler that writes to `planByThread` and broadcasts. mimo only ever sees the normalized `plan` update — it never needs to know about `TodoWrite` vs `Task*`.

**D5 — Keep-last-snapshot lifecycle; clear only on session-clear.**
The plan is never auto-wiped: a new `plan` update replaces it; otherwise it lingers (a completed all-✅ plan is more informative than a flickering empty panel). `clear-session` wipes the cleared thread's plan as part of its existing reset flow.

## Risks / Trade-offs

- **Plan lost on idle-park / server restart** → Accepted; the plan is live progress state, not history. Could be persisted later if needed (would graduate it to "history").
- **opencode emission unverified (external binary, not in tree)** → Map it best-effort; if opencode never emits `plan`, the mapping is inert and harmless. Claude path is unaffected.
- **Stale plan after session-resume from park** → After `loadSession` (or `newSession` fallback) the agent's own plan state is fresh, but mimo's last snapshot lingers until the next update. Mitigation: treat the fresh-context fallback path the same as `clear-session` (wipe the thread plan). Tracked as an open question.
- **Prompt→thread routing miss** → If `currentPromptByThread` lacks the `promptId`, fall back to the session's `activeChatThreadId`; if still unresolved, drop the update rather than mis-attribute it to the wrong thread.
- **Multiple concurrent threads in one session** → `planByThread` is per-thread, so concurrent turns in different threads keep independent plans; the buffer only renders the active thread's entries.

## Open Questions

- On session-resume from idle-park (especially the `newSession` fresh-context fallback), should the thread's plan be wiped like `clear-session`? Leaning yes.
- Snapshot transport: pass `planEntries` as a buffer prop (like `mcp-servers`) vs. a small dedicated GET endpoint vs. extending the per-thread streaming snapshot. Leaning toward extending the existing per-thread snapshot delivered on connect/switch, plus a dedicated `plan` websocket push for live updates.
