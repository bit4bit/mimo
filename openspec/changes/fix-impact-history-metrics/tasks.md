## 1. Impact metrics on commit (platform)

- [x] 1.1 Write failing test: committing a modified file with added branches records `complexity.cyclomatic > 0`, `linesOfCode.added > 0` and `estimatedMinutes > 0`
- [x] 1.2 Write failing test: a partial commit records only the selected files
- [x] 1.3 Move `calculateImpact` before `applySelectedFiles` in `CommitService.commitAndPush`, scoped to `pathsToApply`; build and await the save after a successful commit
- [x] 1.4 Add `|locDelta| / 10` estimated minutes for modified files in `ImpactCalculator`
- [x] 1.5 Confirm tests from 1.1 and 1.2 pass

## 2. Token usage from agent (mimo-agent)

- [x] 2.1 Write failing test: `AcpClient.prompt()` passes the prompt response `usage` to `onPromptCompleted`
- [x] 2.2 Forward `usage` through `onPromptCompleted(sessionId, usage)` and include it on the `prompt_completed` message in `index.ts`
- [x] 2.3 Confirm test passes

## 3. Token accounting (platform)

- [x] 3.1 Write failing tests: `addTokenUsage` sums turns and treats missing fields as 0; `prompt_completed` with usage accumulates `pendingTokenUsage` on the session
- [x] 3.2 Add `pendingTokenUsage` to the Session model and repository mapping; add the pure `addTokenUsage` helper
- [x] 3.3 Accumulate usage in the message router's `prompt_completed` handler
- [x] 3.4 Write failing test: a commit stores `tokens` from the session's pending usage on the impact record and resets it; omits `tokens` when there is none
- [x] 3.5 Copy pending usage into the impact record and reset it in the commit flow
- [x] 3.6 Add optional `tokens` to `ImpactRecord`

## 4. History page

- [x] 4.1 Add a Tokens column to `ImpactHistoryPage` ("—" when absent)

## 5. Verify

- [x] 5.1 Run `bun test` in mimo-platform and mimo-agent; all green
- [x] 5.2 Run prettier on mimo-platform
