## Context

`multi-repo-projects` made projects a collection of mounted repositories, but kept each repository's connection details (URL, credential, clone port) inline on the project entry. This duplicates configuration across projects and forces users to edit structured data by hand. This change promotes Repository to a first-class managed entity, resolving the open question left in the `multi-repo-projects` design ("Should repositories be reusable managed entities outside projects, or project-scoped entries initially?") in favor of reusable managed entities.

## Goals / Non-Goals

**Goals:**

- Manage repositories in a dedicated Repositories section, mirroring the Credentials and Agents UX.
- Reference managed repositories from projects by id.
- Keep mount path and branch configuration per-project, entered in the project form for each picked repository.
- Share repository edits (URL, credential, port) across all referencing projects.
- Block repository deletion while referenced by projects.

**Non-Goals:**

- Changing credential storage semantics; repositories reference existing credentials by id.
- Changing session workspace layout, repo-qualified file identity, or commit fan-out behavior from `multi-repo-projects`.
- Per-project overrides of repository URL or credential.

## Decisions

### 1. Repository entity shape

```ts
interface ManagedRepository {
  id: string;
  ownerId: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  credentialId?: string;
  clonePort?: number;
}
```

Rationale: mirrors the Credential and Agent ownership model; credential validation and ownership rules already exist and can be reused.

### 2. Project repository entry becomes a reference

```ts
interface ProjectRepository {
  repoId: string;
  mountPath: string;
  sourceBranch?: string;
  newBranch?: string;
}
```

There is no primary flag and no legacy top-level mirror fields (repoUrl, repoType, credentialId, sourceBranch, newBranch, clonePort) on the project. The flag only ever fed those mirrors; consumers needing a default repository use the first entry, and connection details are always resolved through the managed repository.

Mount path and branch configuration stay per-project because the same repository may be mounted differently or branched differently in different projects. URL, credential, and port move to the managed entity because they describe the repository itself.

Rationale: picking a repository in a project must not require re-entering connection details; conversely mount placement is inherently project-specific.

### 3. Session and runtime resolution

Session bootstrap, VCS cache, and credential injection resolve connection details by joining `ProjectRepository.repoId` to the managed Repository at session creation time. Session state continues to store resolved per-repo paths, branch, and baseline; runtime session operations do not need to re-read the managed entity except when creating new checkouts.

Rationale: keeps the session deployment pipeline unchanged apart from the lookup step, and avoids surprising live sessions when a repository's credential is rotated — new sessions pick up the new credential, existing checkouts are untouched.

### 4. Delete protection by reference scan

Deleting a repository scans the owner's projects for references. If any reference exists, deletion is rejected with the list of referencing project names.

Rationale: blocking (rather than cascading or detaching) prevents silently breaking projects; the error tells the user exactly what to clean up.

### 5. Migration: one managed entity per inline entry

The migration script converts each existing inline project repository entry into a new managed Repository owned by the project owner (named after the inline entry), then rewrites the project entry to a reference. Entries are not deduplicated across projects automatically; users can merge duplicates later via the UI.

Rationale: deduplication heuristics (same URL? same URL+credential?) risk merging entries the user intended to keep distinct; creating one entity per entry is lossless and safe.

## Risks / Trade-offs

- [Duplicate managed repositories after migration] → Acceptable; provide clear names during migration and let users consolidate manually.
- [Editing a shared repository breaks a project unexpectedly] → Repository edit view shows the list of referencing projects so the impact is visible before saving.
- [Existing APIs/clients still send inline repo definitions] → Project create/update API accepts only references after migration; legacy inline payloads are rejected with a clear validation error.

## Migration Plan

1. Add managed Repository model, persistence, API, and Repositories section UI.
2. Change project schema to repository references with per-project mount path/branch config.
3. Migration script: back up YAML, convert inline entries to managed entities, rewrite projects, validate references.
4. Update session bootstrap to resolve connection details through references.
5. Update project forms to the picker UI; remove inline repository editing.

## Open Questions

- None currently.
