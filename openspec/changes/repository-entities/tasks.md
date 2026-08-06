# Tasks

## 1. Managed repository domain and persistence

- [x] 1.1 Write failing tests for the managed Repository model (fields, owner, validation)
- [x] 1.2 Implement managed Repository domain model and YAML persistence
- [x] 1.3 Write failing tests for repository name uniqueness per owner
- [x] 1.4 Implement name uniqueness validation

## 2. Repository management API

- [x] 2.1 Write failing tests for repository CRUD endpoints (create, list, get, update, delete)
- [x] 2.2 Implement repository CRUD endpoints with auth and ownership enforcement
- [x] 2.3 Write failing tests for credential reference validation (exists, owned by user)
- [x] 2.4 Implement credential validation on repository create/update
- [x] 2.5 Write failing tests for delete protection (blocked with referencing project names, allowed when unreferenced)
- [x] 2.6 Implement reference scan and delete protection
- [x] 2.7 Write failing tests for the referencing-projects listing used by the edit view
- [x] 2.8 Implement referencing-projects lookup endpoint

## 3. Repositories section UI

- [x] 3.1 Add "Repositories" navigation section alongside Credentials and Agents
- [x] 3.2 Implement repository list page
- [x] 3.3 Implement repository create/edit form (name, repoUrl, repoType, credential dropdown with None option, clonePort), never displaying secrets
- [x] 3.4 Show referencing project names on the edit view before save
- [x] 3.5 Implement delete action with blocked-deletion error display

## 4. Project schema and API migration to references

- [x] 4.1 Write failing tests for project schema with repository references (`repoId`, `mountPath`, branch config, `primary`)
- [x] 4.2 Implement project schema change and reference validation (repo exists, owned by user, mount path rules)
- [x] 4.3 Write failing tests rejecting legacy inline repository payloads on project create/update
- [x] 4.4 Update project create/update API to accept only references

## 5. Project form picker UI

- [x] 5.1 Replace inline repository editing with managed repository picker
- [x] 5.2 Add per-picked-repository mount path and branch configuration fields with validation errors
- [x] 5.3 Show empty-state with navigation to Repositories section when the user owns no repositories
- [x] 5.4 Update project detail view to show repository names, credential names, and public indicators

## 6. Session bootstrap and runtime resolution

- [x] 6.1 Write failing tests for session creation resolving connection details through repository references
- [x] 6.2 Update session bootstrap/deployment to resolve repoUrl, credential, and clonePort via managed repository lookup
- [x] 6.3 Update VCS cache and credential injection to key by managed repository id

## 7. Data migration

- [x] 7.1 Write failing tests for migration of inline project repositories to managed entities
- [x] 7.2 Implement migration script: back up YAML, create one managed repository per inline entry, rewrite projects to references, validate references and credential ownership
- [x] 7.3 Verify migration idempotency and rollback via backup restore

## 8. Verification

- [x] 8.1 Run full test suites for both packages
- [x] 8.2 Verify end-to-end flow: create repository, assign credential, pick in two projects with different mount paths, create sessions, edit shared credential, attempt delete while referenced
