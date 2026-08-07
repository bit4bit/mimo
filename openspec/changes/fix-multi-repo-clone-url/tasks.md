## 1. Server: per-repo clone commands

- [x] 1.1 In `packages/mimo-platform/src/web/features/sessions/pages/sessions.tsx`, replace the single `cloneWorkspaceCommand` builder (around line 976-980) with a `cloneCommands` array builder: for each `session.repos` entry, join with `project.repositories` on `projectRepoId === id` to read `name` and `mountPath` (fall back to deriving mountPath from `workspacePath` relative to `agentWorkspacePath`, mirroring `scopeReposByRelativeDir` at line 214-219); build the URL via `buildPublicCloneUrl({ internalUrl: sharedVcsServer.getUrl(sessionId, repo.projectRepoId), platformUrl, publicVcsUrl, sessionId, repoId: repo.projectRepoId })`; build the auth URL with the existing `buildAuthenticatedUrl`; suggest target dir `<sanitizedSessionName>/<mountPath>` (or just `<sanitizedSessionName>` when `mountPath === "."`); produce `git clone <quotedAuthUrl> <quotedTargetDir>`.
- [x] 1.2 Pass `cloneCommands` (array of `{ repoId, name, mountPath, command }`) into `SessionDetailPage` instead of `cloneWorkspaceCommand`. For sessions without `agentWorkspaceUser`/`agentWorkspacePassword`, pass an empty array (no clone button), matching current behavior.

## 2. Component: repository selector modal

- [x] 2.1 In `packages/mimo-platform/src/web/features/sessions/components/SessionDetailPage.tsx`, update the `SessionDetailProps` interface: replace `cloneWorkspaceCommand?: string` with `cloneCommands?: Array<{ repoId: string; name: string; mountPath: string; command: string }>`.
- [x] 2.2 Update the `cloneWorkspaceHtml` logic (line 265-274): render the `Clone Workspace` button when `cloneCommands` is non-empty.
- [x] 2.3 Update the clone modal (line 679-714): when `cloneCommands.length === 1`, render the single `<pre>` with `data-command` as today (but using `cloneCommands[0].command`); when `cloneCommands.length > 1`, render a `<select id="clone-repo-select">` with one `<option value="<repoId>">` per repo (label: `<name> (<mountPath>)`), defaulting to the primary repo, plus a `data-commands` JSON attribute on the `<pre>` (or a hidden element) mapping `repoId → command` and `repoId → mountPath`.
- [x] 2.4 Remove the stale "fossil update" help text from the modal (line 690-692); update to reflect git semantics ("run `git pull` to resync").

## 3. Client: selector swap behavior

- [x] 3.1 In `packages/mimo-platform/public/js/session-clone.js`, read the `data-commands` JSON map (if present) and the current `<select>` value; initialize the displayed command to the selected repo's command.
- [x] 3.2 On `<select>` change, swap `commandEl.textContent` and the copy target to the newly selected repo's command; update any mount-path display.
- [x] 3.3 Keep the existing copy-to-clipboard + status-feedback logic reading the current command (no change for single-repo modal with no selector).

## 4. Tests

- [x] 4.1 In `packages/mimo-platform/test/sessions.test.ts`, update the "render clone workspace action" test (line 931): the single-repo project uses `mountPath: "."` and repo id "default", so assert the command contains `${session.id}/default.git/` (per-repo URL) instead of `${session.id}.git/`, and the target dir is just `Fix-login-flow`.
- [x] 4.2 Update the "uses MIMO_PUBLIC_VCS_URL" test (line 973): assert the command contains `https://dev:secret@yourdomain.com/git/${session.id}/default.git/`.
- [x] 4.3 Add a multi-repo test: project with two repositories ("backend" at "backend", "frontend" at "frontend"); assert the HTML contains a `<select id="clone-repo-select">` with both options and two per-repo commands; assert the backend command target dir is `<sanitizedSessionName>/backend` and URL path is `<sid>/backend.git/`.
- [x] 4.4 Add a test asserting no legacy `<sid>.git/` URL appears in the clone command for either single-repo or multi-repo sessions.
- [x] 4.5 Run `cd packages/mimo-platform && bun test` and ensure the full suite passes.

## 5. Verification

- [x] 5.1 Run `cd packages/mimo-platform && bun run test.full` and ensure unit + integration suites pass.
- [x] 5.2 Confirm `openspec validate --changes fix-multi-repo-clone-url` passes.