## Context

MIMO currently stores project data in `/data/projects/<id>/project.yaml` including repository URL and type (git/fossil). However, there's no mechanism for authenticating with private repositories. The VCS operations in `src/vcs/index.ts` handle cloning and syncing but assume public access.

User authentication is already implemented via `/data/users/<username>/credentials.yaml` storing password hashes. We can follow a similar pattern for VCS credentials.

## Goals / Non-Goals

**Goals:**
- Allow users to store HTTPS credentials (username + password/token) for private repository access
- Allow users to store SSH private keys for Git repository access
- Enable credential reuse across multiple projects (user-scoped, not project-embedded)
- Inject credentials into repository URLs or SSH commands at runtime for git/fossil operations
- Provide CRUD UI for credential management
- Fail fast with clear error messages on authentication failures

**Non-Goals:**
- SSH key generation (user provides keys)
- OAuth or browser-based authentication flows
- Credential encryption at rest (rely on filesystem permissions)
- Team/shared credentials (credentials are strictly user-owned)
- Automatic credential rotation or expiration handling

## Decisions

### 1. User-Scoped Credentials (Not Project-Embedded)
**Decision:** Store credentials in `/data/users/<username>/credentials/` directory, referenced by ID from projects.
**Rationale:** 
- Single source of truth for credentials
- Credential rotation updates all projects automatically
- Follows existing user data pattern (like `credentials.yaml` for auth)
- Similar to GitHub/GitLab personal access tokens

**Alternative considered:** Project-embedded credentials — rejected because it would require updating every project when credentials change.

### 2. Credential Types: HTTPS and SSH
**Decision:** Support two credential types: `https` and `ssh`.

**HTTPS credentials:**
- Injected into repository URLs: `https://username:password@host/path`
- Works for both git and fossil

**SSH credentials:**
- Private key stored in credential
- Uses `GIT_SSH_COMMAND` environment variable to pass key to git
- Creates temporary key file during operations, cleaned up after
- Only works for Git (fossil doesn't support SSH)

**Rationale:**
- HTTPS: Simple URL injection works for both git and fossil
- SSH: Better security (no passwords in URLs), standard for Git
- `GIT_SSH_COMMAND` allows passing private key without modifying global SSH config

### 3. Credential Injection Strategy

**HTTPS:** Inject credentials into repository URLs at runtime.
```
Original:  https://github.com/org/repo.git
Injected:  https://user:token@github.com/org/repo.git
```

**SSH:** Use `GIT_SSH_COMMAND` with temporary key file.
```
export GIT_SSH_COMMAND="ssh -i /tmp/credential-key-xxxx -o IdentitiesOnly=yes"
git clone git@github.com:org/repo.git
```

**Rationale:**
- HTTPS URL injection: Works with both git and fossil CLI tools
- SSH via GIT_SSH_COMMAND: Isolates keys, no global SSH config needed
- Temporary key files: Private keys never persisted outside credential storage

### 4. Fail-Fast with Clear Errors
**Decision:** Repository operations fail immediately if authentication fails, with specific error messages.
**Rationale:**
- Users should know immediately if credentials are wrong/expired
- Enables better UX (suggest updating credentials, check access)
- Prevents silent failures that are hard to debug

### 5. File Permissions for Security
**Decision:** Store credentials with filesystem permissions 600 (owner read/write only).
**Rationale:**
- Simple and effective for single-user deployments
- No encryption complexity
- Standard Unix permission model

**Risk:** Credentials are plaintext in YAML files. Mitigation: filesystem permissions + single-user model.

### 6. Temporary SSH Key Files
**Decision:** Write SSH private keys to temporary files during operations, clean up immediately after.

**Lifecycle:**
1. Read credential from storage
2. Write private key to temp file (permissions 600)
3. Set `GIT_SSH_COMMAND` to use temp key
4. Execute git operation
5. Delete temp file immediately

**Rationale:**
- Git requires key file on disk (can't pass via stdin)
- Temp files have minimal exposure window
- Cleaned up even on operation failure

## Risks / Trade-offs

**[Risk]** Credentials stored unencrypted on disk
→ **Mitigation:** Filesystem permissions 600; acceptable for single-user deployments; consider encryption if multi-user security requirements increase

**[Risk]** SSH private keys written to temporary files
→ **Mitigation:** Files created with 600 permissions; deleted immediately after use; temp directory should be secure (not world-readable)

**[Risk]** Credentials may briefly appear in process lists when injected into URLs
→ **Mitigation:** Git/fossil don't log full URLs with credentials; operations are short-lived

**[Risk]** User accidentally commits credential files if backup/sync misconfigured
→ **Mitigation:** Credentials stored in `/data/` which should be in `.gitignore`; clear documentation

**[Risk]** Credential ID reference becomes invalid (credential deleted after project created)
→ **Mitigation:** Validate credential exists before operations; show clear error if missing

**[Risk]** SSH key format compatibility
→ **Mitigation:** Support standard PEM format; validate key format on save

## Migration Plan

No migration needed for existing projects:
- Existing projects without `credentialId` continue to work as public repositories
- New projects can optionally select a credential
- Credential management is additive feature

## Open Questions

None - design is finalized.
