## 1. Prefill Logic in showCreateThreadDialog()

- [x] 1.1 Call `getActiveThread()` at the top of `showCreateThreadDialog()` and store the result as `seedThread`
- [x] 1.2 After the agents list is fetched, check if `seedThread?.assignedAgentId` is present in the fetched agents array
- [x] 1.3 If the seed agent is found, set the agent select's value to `seedThread.assignedAgentId` after the dialog is appended to the DOM
- [x] 1.4 Immediately after pre-selecting the agent, trigger the capabilities fetch by dispatching a `change` event on `#new-thread-agent` (reuses existing handler and `latestCapabilitiesRequest` guard)
- [x] 1.5 Inside the capabilities response callback, after calling `updateThreadOptionSelects`, set model select value to `seedThread.model` and mode select value to `seedThread.mode` when a seed is active

## 2. Fallback Behaviour

- [ ] 2.1 Verify that when `seedThread` is null (no active thread), the dialog opens exactly as before — no regressions
- [ ] 2.2 Verify that when `seedThread.assignedAgentId` is not in the online agents list, the dialog opens with no prefilling

## 3. Manual Testing

- [ ] 3.1 Open session with an active thread (agent online) → click "+" → verify agent, model, mode are pre-selected
- [ ] 3.2 While prefill fetch is loading, change the agent dropdown → verify prefill result is discarded and new agent's capabilities are used
- [ ] 3.3 Open session with no active thread → click "+" → verify form is blank (name empty, agent shows "Select an agent")
- [ ] 3.4 Open session where active thread's agent is offline → click "+" → verify form is blank
- [ ] 3.5 Confirm name input is empty and focused in all prefill scenarios
- [ ] 3.6 Confirm instructions field shows `window.MIMO_DEFAULT_INSTRUCTIONS` in all prefill scenarios
