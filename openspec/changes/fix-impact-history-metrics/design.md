## Context

`CommitService.commitAndPush` (mimo-platform `src/domain/commits/service.ts`) currently runs in this order:

1. derive `changes`
2. `applySelectedFiles` copies the workspace into upstream
3. `commitUpstream`
4. `impactCalculator.calculateImpact(upstream, workspace, changes)`
5. `impactRepository.save(record)` (not awaited)

In step 4, upstream already equals the workspace for every applied file. `scc` deltas for modified files are therefore 0. Deleted files no longer exist upstream, so they are skipped. Only added files register.

In the calculator, `estimatedMinutes` is only incremented for new files (`code / 10`).

For tokens: ACP `PromptResponse.usage` carries per-turn `inputTokens`, `outputTokens`, `thoughtTokens`, `cachedReadTokens`, `cachedWriteTokens` and `totalTokens`. `claude-agent-acp` fills it in. mimo-agent's `AcpClient.prompt()` receives the response, but `onPromptCompleted(sessionId)` drops it. The platform's `prompt_completed` handler already accepts `data.usage`, but it only rebroadcasts it and never persists it.

## Goals / Non-Goals

**Goals:**

- Impact records reflect the real complexity, LOC and estimated time of the committed files.
- Each impact record carries the tokens spent in the session since its previous commit.

**Non-Goals:**

- Computing cognitive complexity (still 0).
- Backfilling existing impact records.
- Splitting tokens across repos in a multi-repo session commit.
- Showing tokens anywhere other than the Impact History page.

## Decisions

### Calculate impact before applying files, save after commit

Move `calculateImpact` to just after path validation and before `applySelectedFiles`. Keep the metrics in a local variable. Build and `await` the record save only after `commitUpstream` succeeds, so the record carries the real commit hash. Calculation errors stay best-effort: they are logged and the impact record is skipped, but the commit proceeds.

_Alternative:_ diff against the parent commit after committing. Rejected because it needs a VCS-specific path for each repo type, while the existing two-tree calculator already works when called at the right time.

### Scope impact to committed paths

Pass `{ ...changes, files: changes.files.filter(f => pathsToApply.includes(f.path)) }` to the calculator, so partial commits only report the selected files.

### Estimated time for modified files

In the modified-file branch, add `|locDelta| / 10` to `estimatedMinutes`, using the same rate as new files. This is a minimal change that keeps the existing heuristic.

### Token accounting on the session record

- mimo-agent: `onPromptCompleted(sessionId, usage?)`, where `usage` is `response.usage` from the ACP prompt call. `index.ts` includes `usage` on the `prompt_completed` message when present.
- Platform: the `prompt_completed` handler in `message-router.ts` adds the turn's token counts into a new optional session field `pendingTokenUsage` (`{ input, output, thought, cachedRead, cachedWrite, total }`) through `sessionRepository.update`.
- Commit flow: after a successful commit, copy `session.pendingTokenUsage` into `impactRecord.tokens` and reset the session field.

_Alternative:_ persist usage on chat messages and sum the history since the last impact `commitDate`. Rejected because it touches the streaming pipeline's two save paths and scans every thread file on each commit. A running total on the session is O(1) and stays explicit.

A pure helper `addTokenUsage(acc, acpUsage)` handles the summing and normalizes missing fields to 0.

### Display

Add a "Tokens" column to `ImpactHistoryPage`: total, with an input/output breakdown in a `title` tooltip. Show "—" when `tokens` is absent.

## Risks / Trade-offs

- [Prompt finishes while a commit is running] → its tokens may be attributed to the next commit. This is acceptable for a running total.
- [Multi-repo session commits] → the first repo committed gets all pending tokens. Documented under non-goals.
- [Provider returns no `usage`] → nothing is accumulated and the column shows "—".
- [Impact is calculated even when the commit later fails] → the extra scc run is wasted, but no record is written.
