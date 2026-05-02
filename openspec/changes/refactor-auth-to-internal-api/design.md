## Context

Auth routes handle user registration, login, and logout. Authentication is critical and needs careful handling of passwords, tokens, and cookies.

## Goals / Non-Goals

**Goals:**
- Create internal API for auth operations
- Refactor routes to proxy login/registration
- Keep cookie handling in routes layer

**Non-Goals:**
- Changing authentication mechanism
- New auth methods

## Decisions

### 1. Endpoint Mapping
- `POST /api/internal/auth/register` → register new user
- `POST /api/internal/auth/login` → login, returns token
- `POST /api/internal/auth/logout` → logout (token invalidation)
- `GET /api/internal/auth/verify` → verify token validity

### 2. Cookie Handling
Routes layer handles cookie setting/clearing. Internal API returns tokens in JSON, routes set as cookies.

### 3. Password Security
Password hashing stays in internal API using Bun.password.hash/verify.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Token exposure | Internal API returns token in JSON body, not logs |
| Cookie security | Routes set HttpOnly, Secure, SameSite=Strict cookies |

## Migration Plan

1. Create internal API handlers
2. Create internal API routes
3. Refactor web routes (login/register proxy, logout clears cookies)
4. Update tests
5. Verify auth flow works
