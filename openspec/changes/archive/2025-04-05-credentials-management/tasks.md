## 1. Data Layer - Credentials Repository

- [x] 1.1 Create `src/credentials/repository.ts` with Credential interface supporting https and ssh types
- [x] 1.2 Implement `create()` method with file permissions 600
- [x] 1.3 Implement `findById()`, `findByOwner()`, `update()`, `delete()` methods
- [x] 1.4 Add `getCredentialsPath()` helper to `config/paths.ts` for user credentials directory
- [x] 1.5 Add SSH private key format validation in repository

## 2. Data Layer - Update Project Repository

- [x] 2.1 Update Project interface to include optional `credentialId` field
- [x] 2.2 Update ProjectData interface to include optional `credentialId` field
- [x] 2.3 Update `create()` method to accept and store credentialId
- [x] 2.4 Update `update()` method to handle credentialId changes

## 3. Backend Routes - Credentials CRUD

- [x] 3.1 Create `src/credentials/routes.tsx` with Hono router
- [x] 3.2 Implement GET `/credentials` - list all user credentials
- [x] 3.3 Implement GET `/credentials/new` - show create form with type selection (https/ssh)
- [x] 3.4 Implement POST `/credentials` - create new credential (https or ssh)
- [x] 3.5 Implement GET `/credentials/:id/edit` - show edit form
- [x] 3.6 Implement POST `/credentials/:id/edit` - update credential
- [x] 3.7 Implement POST `/credentials/:id/delete` - delete credential
- [x] 3.8 Add ownership validation (404 if credential not owned by user)
- [x] 3.9 Add SSH private key validation on create/update

## 4. Backend Routes - Update Projects

- [x] 4.1 Update POST `/projects` to validate credentialId belongs to user
- [x] 4.2 Update POST `/projects` to validate credential type matches repo URL type
- [x] 4.3 Update POST `/projects/:id/edit` to validate credentialId belongs to user
- [x] 4.4 Update POST `/projects/:id/edit` to validate credential type matches repo URL type
- [x] 4.5 Update project creation form handler to pass credentialId

## 5. Frontend Components - Credentials UI

- [x] 5.1 Create `src/components/CredentialsListPage.tsx` - list all credentials with type indicators
- [x] 5.2 Create `src/components/CredentialCreatePage.tsx` - create form with type selector (https/ssh)
- [x] 5.3 Create `src/components/CredentialEditPage.tsx` - edit form with masked password/key
- [x] 5.4 Add credentials navigation link to Layout.tsx
- [x] 5.5 Show SSH key fingerprint or preview in list/edit views

## 6. Frontend Components - Update Projects

- [x] 6.1 Update `src/components/ProjectCreatePage.tsx` - add credential dropdown with type filtering
- [x] 6.2 Update `src/components/ProjectEditPage.tsx` - add credential dropdown with type filtering
- [x] 6.3 Update `src/components/ProjectDetailPage.tsx` - show credential name and type
- [x] 6.4 Validate credential type matches repo URL type in frontend

## 7. VCS Integration - HTTPS Credential Injection

- [x] 7.1 Create `injectHttpsCredentials(repoUrl, credential)` helper function
- [x] 7.2 Update `cloneRepository()` to accept optional credential and inject into URL
- [x] 7.3 Update `pushToRemote()` to accept optional credential and inject into URL
- [x] 7.4 Update `importGitToFossil()` to accept optional credential and inject into URL
- [x] 7.5 Update `sync()` operations to use credential if configured

## 8. VCS Integration - SSH Credential Injection

- [x] 8.1 Create `createTempSshKeyFile(privateKey)` helper that writes key to temp file with 600 permissions
- [x] 8.2 Create `deleteTempSshKeyFile(keyPath)` helper for cleanup
- [x] 8.3 Create `buildGitSshCommand(keyPath)` helper returning SSH command string
- [x] 8.4 Update `cloneRepository()` to support SSH credentials via GIT_SSH_COMMAND
- [x] 8.5 Update `pushToRemote()` to support SSH credentials via GIT_SSH_COMMAND
- [x] 8.6 Ensure temp key files are cleaned up even on operation failure (try/finally)

## 9. VCS Integration - Error Handling

- [x] 9.1 Detect HTTPS authentication failures in git/fossil command output
- [x] 9.2 Detect SSH authentication failures in git command output
- [x] 9.3 Return specific error messages: "Authentication failed" vs "SSH authentication failed"
- [x] 9.4 Validate credential exists before VCS operations and show "Credential not found" error

## 10. Integration - Wire Everything Together

- [x] 10.1 Import credentials routes in `src/index.tsx` and mount at `/credentials`
- [x] 10.2 Update session creation to pass credential when setting up worktrees
- [x] 10.3 Update sync operations to use project's configured credential
- [x] 10.4 Pass credentials list to project create/edit forms
- [x] 10.5 Filter credentials by type (https/ssh) based on repo URL in project forms

## 11. Testing

- [x] 11.1 Test creating HTTPS credential with proper file permissions
- [x] 11.2 Test creating SSH credential with private key validation
- [x] 11.3 Test credential ownership validation (cannot access other user's credentials)
- [x] 11.4 Test project creation with HTTPS credential selection
- [x] 11.5 Test project creation with SSH credential selection
- [x] 11.6 Test credential type mismatch validation (https vs ssh)
- [x] 11.7 Test HTTPS credential injection produces correct URLs
- [x] 11.8 Test SSH credential injection via GIT_SSH_COMMAND
- [x] 11.9 Test SSH temp key file cleanup on success and failure
- [x] 11.10 Test error handling when HTTPS credential is invalid
- [x] 11.11 Test error handling when SSH key is invalid
- [x] 11.12 Test project works without credential (public repo behavior)
- [x] 11.13 Verify credentials list masks passwords and keys
