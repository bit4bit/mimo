## Why

The Impact History page shows zero (or near-zero) complexity, LOC and estimated time for most commits. The commit flow calculates impact only after `applySelectedFiles` has already copied the workspace into upstream, so both sides of the diff are the same. Users also cannot see how many LLM tokens a commit cost, even though ACP agents report that number at the end of each prompt turn.

## What Changes

- Calculate commit impact **before** the selected files are applied to upstream, so complexity and LOC deltas reflect the real change.
- Only include the files actually being committed (`pathsToApply`) in the impact record, not every changed file in the workspace.
- Count estimated time for modified files (based on changed lines), not only for new files.
- Await the impact record write so failures are caught and logged instead of escaping as unhandled rejections.
- mimo-agent forwards the ACP `PromptResponse.usage` (input/output/thought/cache tokens) on the `prompt_completed` message.
- The commit flow adds up the token usage recorded in the session's chat history since the session's previous impact record, and stores it on the impact record.
- The Impact History page shows a **Tokens** column ("—" when the provider reported no usage).

## Capabilities

### New Capabilities

- `prompt-token-usage`: mimo-agent reports per-turn token usage from the ACP prompt response on `prompt_completed`, and the platform persists it with the agent message.

### Modified Capabilities

- `impact-history`: impact records hold metrics calculated before files are applied, scoped to the committed files, with estimated time for modified files and an optional `tokens` field. The history page shows tokens.

## Impact

- `packages/mimo-platform/src/domain/commits/service.ts`: reorder impact calculation, scope it to committed paths, await save, add tokens
- `packages/mimo-platform/src/domain/impact/calculator.ts`: estimated time for modified files
- `packages/mimo-platform/src/domain/impact/repository.ts`: optional `tokens` field
- `packages/mimo-platform/src/web/features/projects/components/ImpactHistoryPage.tsx`: Tokens column
- `packages/mimo-agent/src/acp/client.ts`, `packages/mimo-agent/src/index.ts`: forward usage on `prompt_completed`
- Existing impact YAML files stay readable (`tokens` is optional).
