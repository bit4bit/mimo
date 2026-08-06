## Why

The `multi-repo-projects` change models project repositories as inline entries edited inside the project form, forcing users to re-enter repository URL, credential, and clone configuration as raw structured data for every project. Users need repositories to be reusable, managed entities — created once in a dedicated section (like Credentials and Agents) and simply picked inside projects.

## What Changes

- Add a new top-level **Repositories** management section (list/create/edit/delete), following the same UX pattern as Credentials and Agents pages.
- Introduce a managed `Repository` entity owned by the user: `id`, `name`, `repoUrl`, `repoType`, `credentialId?`, `clonePort?`.
- Change project repository entries from inline repo definitions to references: `{ repoId, mountPath, sourceBranch?, newBranch? }`. Mount path and branch configuration stay per-project; URL/credential/port live on the Repository entity. Remove the primary flag and the legacy top-level project mirror fields (repoUrl, repoType, credentialId, branch fields, clonePort); consumers use the first repository entry and resolve connection details through the Repository entity.
- Replace the project form's inline repository editing with a picker: select one or more managed repositories, and for each picked repository enter its mount path (and optional branch configuration).
- Editing a Repository's URL/credential/port affects all projects referencing it.
- Deleting a Repository is blocked while any project references it.
- Migrate existing inline project repository entries into managed Repository entities (one per unique inline entry) and rewrite project entries to references.

## Capabilities

### New Capabilities

- `repository-management`: CRUD, credential assignment, sharing semantics, and delete protection for managed repositories.

### Modified Capabilities

- `multi-repo-projects`: Project repository entries become references to managed repositories plus per-project mount path, branch configuration, and primary flag.
- `projects`: Credential assignment moves from project repository entries to the managed Repository entity; project forms pick repositories instead of defining them inline.

## Impact

- New REST API endpoints and web pages for repository management.
- Project domain model, YAML persistence, and project create/edit forms.
- Session bootstrap resolves repository connection details through managed repository references.
- VCS cache and credential injection keyed by managed repository id.
- Migration tooling to convert inline project repositories into managed entities.
