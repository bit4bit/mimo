## Context

The create-thread dialog (`showCreateThreadDialog()` in `chat-threads.js`) today always opens blank. Model and mode selects are locked with "Select an agent first" until the user manually picks an agent, which triggers a capabilities fetch via the agent `change` event handler. The active thread is already available in-memory via `getActiveThread()` and carries `assignedAgentId`, `model`, and `mode`.

## Goals / Non-Goals

**Goals:**

- Pre-select agent, model, and mode from the active thread when the dialog opens
- Trigger capabilities fetch eagerly on open (same logic as the existing agent change handler)
- Graceful fallback to blank form when active thread has no agent or agent is not online

**Non-Goals:**

- Prefilling thread name or instructions
- Any backend or API changes
- Changes to thread creation validation logic

## Decisions

**Reuse the existing agent-change handler logic rather than duplicating it**

The `change` event on `#new-thread-agent` already fetches capabilities and calls `updateThreadOptionSelects`. After building the dialog HTML and appending it to the DOM, we can programmatically set the agent select's value and dispatch a `change` event (or call the same handler function directly). Dispatching the event keeps a single code path and avoids duplication.

Alternative considered: duplicate the fetch + populate logic inline for the "prefill" case. Rejected because it splits the capability-fetch logic into two places that could diverge.

**Pre-select model and mode after capabilities load, not before**

The model/mode values from the active thread are used to set the selected option only after `updateThreadOptionSelects` populates the selects. This is done inside the capabilities response callback by matching `activeThread.model` and `activeThread.mode` against the loaded options.

**Fallback: agent not found in online list → no prefill**

If `activeThread.assignedAgentId` is not present in the fetched agents array, the form opens as today — agent dropdown shows "Select an agent", model/mode show "Select an agent first". No error, no warning.

## Risks / Trade-offs

**Capabilities fetch adds latency before model/mode are selectable** → Mitigation: "Loading models..." / "Loading modes..." placeholders already exist in the current handler. User can type the thread name while waiting — acceptable per the agreed scope.

**Race condition if user changes agent while prefill fetch is in flight** → Mitigation: the existing `latestCapabilitiesRequest` counter already guards against stale responses. The prefill fetch uses the same counter so it is naturally cancelled if the user picks a different agent.
