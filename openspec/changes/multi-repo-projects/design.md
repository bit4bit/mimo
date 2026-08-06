## Context

The platform currently assumes one repository per project and one repository pair per session. A project stores a single `repoUrl`, `credentialId`, branch configuration, and cache. A session stores one `upstreamPath`, one `agentWorkspacePath`, one branch, and one baseline. Session creation clones the project repository into `upstream/`, seeds one bare session repository, and exposes one clone URL to the agent. Sync, patch, review, commit, force-push, file tree, and impact flows all compare one upstream tree with one workspace tree.

Users need to work on connected changes across multiple repositories in one project/session. The design must preserve real git semantics per repository while presenting a unified workflow in the UI.

## Goals / Non-Goals

**Goals:**

- Model projects as a set of repositories with explicit mount paths.
- Deploy session workspaces as a container of repository checkouts.
- Keep each repository as an independent git repository with its own remote, branch, baseline, cache, and push behavior.
- Allow the agent session working directory to be any validated workspace-relative directory.
- Make file identity repo-qualified (`repoId + path`) across platform APIs and buffers.
- Aggregate commit/review/impact experiences across repositories.
- Commit the same message across repositories on a best-effort basis with clear per-repo results.
- Migrate existing single-repo data with a script instead of maintaining a long-term runtime legacy mode.

**Non-Goals:**

- Atomic cross-repository commits or distributed transactions.
- A synthetic combined git repository that rewrites multiple repos into one history.
- Cross-repository dependency/impact analysis beyond repository selection and aggregate display.
- Changing credential storage semantics beyond referencing credentials per project repository.
- Preserving runtime backward compatibility for legacy single-repo API shapes after migration.

## Decisions

### 1. Project repositories are first-class entries, not a combined repo

Project schema moves from scalar repo fields to:

```ts
repositories: Array<{
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  credentialId?: string;
  sourceBranch?: string;
  newBranch?: string;
  clonePort?: number;
  mountPath: string;
  primary?: boolean;
}>
```

Rationale: each repository keeps its own remote/history/credentials, and the platform can fan out git operations per repo. A synthetic monorepo was rejected because it breaks remote semantics and makes push/review behavior misleading.

### 2. Session workspace becomes a mounted container

Session state moves from one upstream/workspace pair to per-repo entries:

```text
<project>/sessions/<session>/
├── upstream/
│   ├── backend/
│   └── frontend/
└── agent-workspace/
    ├── backend/
    └── frontend/
```

Each session repo entry stores `projectRepoId`, `upstreamPath`, `workspacePath`, `branch`, and `baseline`. The workspace root is no longer assumed to be a git root.

### 3. File identity becomes `{ repoId, path }`

Changed files, selected paths, review hunks, patch application, and impact files must carry `repoId` plus repo-relative `path`. Workspace-relative paths are resolved by longest matching `mountPath`.

Rationale: path-only identity is ambiguous once multiple repositories can contain the same relative path.

### 4. Session working directory remains workspace-relative

The existing `agentSubpath` concept is generalized to a workspace-relative `relativeDir`. The platform validates that the directory stays inside the agent workspace and resolves the containing repository when needed.

Rationale: users may want to run the agent at workspace root, inside one repo, or inside a subdirectory of a repo.

### 5. Best-effort commit fan-out

Committing the same message across repositories is implemented as independent per-repo commit/push operations. Each repo returns `committed`, `skipped`, or `failed`. Failures do not roll back other repositories.

Rationale: matches the requested behavior and avoids pretending git supports atomic multi-repo commits.

### 6. Per-repo git serving and credentials

Each session repository gets its own bare session repo and clone URL, keyed by session + repo. Credentials remain user-owned and are injected per repository during clone/push using the existing HTTPS/SSH mechanisms, centralized to avoid duplicated credential logic.

### 7. Migration script over runtime compatibility

A migration script converts existing project/session YAML and path metadata to schema v2. Runtime code should only support the multi-repo shape after migration.

Rationale: avoids permanent `legacy vs multi-repo` branching through domain, API, and UI code.

## Risks / Trade-offs

- [Large API/data-shape migration] → Introduce repo-qualified types once and update all producers/consumers in the same change.
- [Partial commit failures confuse users] → Commit UI must group results by repository and expose retry/force-push/manual-fix actions.
- [More git operations per session] → Keep per-repo caches and run independent repo operations in parallel where safe.
- [Mount path collisions or nested repos] → Validate normalized mount paths, reject duplicates, traversal, `.git`, and nested mount points.
- [Existing sessions break after deployment] → Migration script must be idempotent, validate expected paths, and back up YAML before rewriting.
- [Impact/review performance across many repos] → Calculate per repo lazily and provide aggregate summaries from cached per-repo results.

## Migration Plan

1. Add schema v2 models for project repositories and session repos.
2. Implement migration script:
   - back up existing project/session YAML;
   - convert project scalar repo fields into `repositories[0]` with `mountPath: "."`;
   - convert session scalar paths/baseline into `repos[0]`;
   - validate credentials, project/session references, and expected directories;
   - write v2 data and remove legacy fields.
3. Update session creation/deployment to materialize mounted repos.
4. Update agent readiness/checkout payload for multiple repos.
5. Update sync/patch/review/commit/impact APIs and buffers to use repo-qualified paths.
6. Remove legacy single-repo runtime handling after migration path is verified.

Rollback strategy: restore backed-up YAML and run the previous release; no automatic down-migration is provided once new multi-repo sessions are created.

## Open Questions

- Should repositories be reusable managed entities outside projects, or project-scoped entries initially?
- Should force-push remain a separate explicit action per repo, or also appear as a bulk action for failed repos?
- Should aggregate impact be a simple sum of repo metrics, or should it de-emphasize metrics that are not comparable across repos?
