## Context

After `multi-repo-projects`, session deployment seeds one bare repo per session repository on disk as `<sid>-<repoId>.git` and the git HTTP server serves each at `/<sid>/<repoId>.git/`. The agent handoff path (`message-router.ts`) was updated to build per-repo clone URLs and pass them in `repos[]` to the agent.

The browser "Clone Workspace" command was not updated. It still calls `getBrowserCloneUrl(sessionId)` → `buildPublicCloneUrl({ internalUrl: getUrl(sessionId) })` with **no `repoId`**, producing `/<sid>.git/`. No such bare repo exists for multi-repo sessions, so `git http-backend` returns `fatal: repository '…/<sid>.git/' not found`.

The `buildPublicCloneUrl` helper already accepts `repoId` — only the browser-path caller forgot to pass it. The session detail route handler already has `session.repos` (with `projectRepoId`, `workspacePath`) and `project.repositories` (with `mountPath`) in scope.

## Goals / Non-Goals

**Goals:**

- Make the browser clone command resolve to a real per-repo bare repo URL.
- Let the user pick which repository to clone when a session has more than one.
- Keep the single-repo UX unchanged in shape (one command, no selector) but with the corrected URL.

**Non-Goals:**

- Cloning all repositories in one command/script. Out of scope; the user clones one at a time via the selector.
- Changing agent clone behavior (already correct).
- Data migration (existing multi-repo sessions already have the right bare repos on disk).
- Changing `buildPublicCloneUrl` or `git-http-server` (already support `repoId`).

## Decisions

### 1. Build a per-repo command array, not a single string

The route handler (`sessions.tsx:976`) currently builds one `cloneWorkspaceCommand` string. It will instead build a `cloneCommands` array of `{ repoId, name, mountPath, command }`, one entry per `session.repos`. Each entry's URL is built via `buildPublicCloneUrl({ internalUrl: getUrl(sessionId, repo.projectRepoId), …, sessionId, repoId: repo.projectRepoId })`.

Rationale: `buildPublicCloneUrl` and `getUrl` already support `repoId`; only the caller was wrong. Reusing them avoids duplicating URL logic.

### 2. Resolve mountPath from project.repositories

`session.repos` carries `projectRepoId` and `workspacePath` but not `mountPath` directly. The handler will join `session.repos` with `project.repositories` on `id === projectRepoId` to read `mountPath` and `name`. If the join misses (shouldn't happen post-migration), fall back to deriving mountPath from `workspacePath` relative to `agentWorkspacePath` — the same logic already used at `sessions.tsx:214-219` for `scopeReposByRelativeDir`.

Rationale: keeps the change minimal and avoids new session-data fields.

### 3. Suggested target directory mirrors mount layout

`<sessionName>/<mountPath>` for non-root mount paths; `<sessionName>` for `mountPath: "."`. Session name is sanitized with the existing `sanitizeSessionNameForWorkdir` (replaces `/` and `\` with `-`).

Rationale: mirrors what the agent workspace looks like on disk, so a local clone lands in a familiar layout.

### 4. Component renders a selector for multi-repo, omits it for single-repo

`SessionDetailPage` receives `cloneCommands` (array). If length ≤ 1, it renders the current single-command modal with the corrected command. If > 1, it renders a `<select>` above the `<pre>`, defaulting to the primary repository (or the first one).

Rationale: preserves the clean single-repo UX while making multi-repo discoverable. A `<select>` matches existing modal styling and is keyboard-accessible.

### 5. Client JS swaps the active command on selector change

`session-clone.js` reads a `data-commands` JSON map keyed by `repoId` on the `<pre>` (or a sibling element). On `<select>` change, it updates `commandEl.textContent` and the copy target. The existing copy + status-feedback logic stays unchanged; it just reads the current command.

Rationale: smallest change to the client script; no framework or new dependencies.

## Risks / Trade-offs

- [Single-repo sessions also affected] The deployment code at `sessions.tsx:735` always passes `projectRepo.id`, so even single-repo sessions no longer create `<sid>.git`. → This fix corrects both single- and multi-repo browser clone URLs; no separate single-repo fix needed.
- [Selector adds a click before copy] → Acceptable; multi-repo sessions inherently need a choice, and single-repo sessions skip the selector entirely.
- [mountPath join could miss for malformed sessions] → Fallback to deriving mountPath from `workspacePath` (already proven in `scopeReposByRelativeDir`); worst case the directory suggestion is wrong but the URL is still correct and cloneable.

## Migration Plan

No data migration. Existing sessions already have the correct bare repos on disk. The fix is purely URL construction + UI. Deploy and the clone command works immediately for all existing sessions.

Rollback: revert the UI change; the agent path is unaffected and continues to work.