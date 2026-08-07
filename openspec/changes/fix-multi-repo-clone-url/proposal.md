## Why

After `multi-repo-projects`, every session repository is seeded as its own bare repo served at `/<sid>/<repoId>.git/`. The browser "Clone Workspace" command was never updated and still builds the legacy `/<sid>.git/` URL (no `repoId`), which 404s against `git http-backend` because no `<sid>.git` bare repo exists on disk anymore. Users can no longer clone their session workspace from the UI.

## What Changes

- Fix the browser clone command to use per-repo clone URLs (`buildPublicCloneUrl` with `repoId`), matching the agent handoff path that already works.
- Replace the single clone command with a per-repository selector in the "Clone Workspace" modal: a `<select>` of session repositories, each producing its own ready-to-run `git clone` command.
- For single-repo sessions, the selector is omitted (degenerate to the current single-command UX, but with the corrected per-repo URL).
- Suggested clone target directory mirrors the workspace mount layout: `<sessionName>/<mountPath>` for multi-repo, `<sessionName>` when `mountPath` is `.`.
- Add the missing spec requirement for per-repo git serving that `multi-repo-projects` implemented in code but never captured as a spec.

## Capabilities

### New Capabilities

- `session-clone-command`: Per-repository clone command surfaced in the session UI, with a repository selector for multi-repo sessions.

### Modified Capabilities

- `session-management`: Session deployment SHALL seed one bare session repository per session repository, served at a per-repo URL, replacing the legacy single per-session bare repo.

## Impact

- `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx` — build per-repo `cloneCommands` array instead of a single `cloneWorkspaceCommand`.
- `packages/mimo-platform/src/web/features/sessions/components/SessionDetailPage.tsx` — render repository `<select>` + dynamic command `<pre>`.
- `packages/mimo-platform/public/js/session-clone.js` — swap displayed command on selector change; copy the active command.
- `packages/mimo-platform/src/domain/vcs/clone-url.ts` — no change (already supports `repoId`), but now used by the browser path.
- No data migration: existing multi-repo sessions already have `<sid>-<repoId>.git` bare repos on disk; the bug was purely URL construction + UI.
- No breaking API changes; clone command shape moves from string to array of `{ repoId, name, mountPath, command }`.