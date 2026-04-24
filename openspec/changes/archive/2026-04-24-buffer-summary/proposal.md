## Why

As sessions grow longer, chat history becomes hard to parse — users lose track of decisions made, topics discussed, and current state. A dedicated Summary buffer lets users generate an on-demand structured summary of any chat thread using another thread's agent, without leaving the session view.

## What Changes

- Add a new `Summary` buffer registered in the right frame (after Impact)
- Add two thread selectors to the buffer: one for the thread to analyze, one for the thread to summarize via
- Add a Refresh button that triggers async summarization: loads analyze-thread history, sends it to the summarize-via agent, streams the result back
- Add `summary.prompt` to the global YAML config (personalizable default prompt)
- Summary output is ephemeral — held in client JS memory, cleared on reload

## Capabilities

### New Capabilities

- `buffer-summary`: Right-frame buffer that renders an on-demand, ephemeral, LLM-generated summary of a selected chat thread's history using a second selected chat thread's agent

### Modified Capabilities

- `frame-buffers`: New `summary` buffer registered in the right frame; R6 default state unchanged (impact still default active)

## Impact

- `packages/mimo-platform/src/components/SummaryBuffer.tsx` — new component
- `packages/mimo-platform/src/buffers/index.ts` — register summary buffer
- `packages/mimo-platform/src/config/service.ts` — add `SummaryConfig` to `Config`
- New `packages/mimo-platform/src/summary/routes.tsx` — POST endpoint for refresh
- No schema changes, no breaking API changes
