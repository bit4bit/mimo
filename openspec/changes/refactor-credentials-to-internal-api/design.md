## Context

Credentials routes currently mix HTML rendering with direct repository calls for managing SSH and HTTPS credentials. This refactor extracts the business logic.

## Goals / Non-Goals

**Goals:**

- Create internal API for credentials CRUD (both HTTPS and SSH types)
- Refactor routes to proxy to internal API
- Keep all existing functionality
- Handle credential secrets securely

**Non-Goals:**

- Changing CredentialRepository implementation
- New credential types
- Breaking changes

## Decisions

### 1. Endpoint Mapping

- `GET /api/internal/credentials` → list credentials (excluding secrets)
- `GET /api/internal/credentials/:id` → get credential (with secrets for editing)
- `POST /api/internal/credentials` → create credential (HTTPS or SSH)
- `PUT /api/internal/credentials/:id` → update credential
- `DELETE /api/internal/credentials/:id` → delete credential

### 2. Credential Types

The internal API supports both:

- **HTTPS**: name, username, password
- **SSH**: name, privateKey

### 3. Response Security

List endpoint returns credentials without secrets. Get by ID returns full credential including secrets (for edit forms).

## Risks / Trade-offs

| Risk                                | Mitigation                                                   |
| ----------------------------------- | ------------------------------------------------------------ |
| Credential secrets in API responses | Only return secrets for specific get endpoint, never in list |
| Validation duplication              | Routes do minimal validation, API does full validation       |

## Migration Plan

1. Create internal API handlers
2. Create internal API routes
3. Refactor web routes to proxy
4. Update tests
5. Verify credential CRUD works for both HTTPS and SSH
