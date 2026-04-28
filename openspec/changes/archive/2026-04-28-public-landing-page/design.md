## Context

MIMO currently has no public landing page. The root route (`/`) immediately redirects to login for unauthenticated users. This creates a poor experience for new users who want to understand the platform before creating an account.

The platform uses:
- Hono framework with JSX server-side rendering
- Filesystem-based storage (YAML files in `~/.mimo/`)
- JWT authentication with cookie-based sessions
- Protected routes via auth middleware

Current route structure:
- `/` → redirects to `/auth/login` or `/projects` based on auth
- All project/session routes are protected

## Goals / Non-Goals

**Goals:**
- Create public landing page showing platform description and features
- Display public project list (names, descriptions, owners, types) without authentication
- Add optional `description` field to projects for better discoverability
- Provide clear login/register CTAs on landing page
- Allow clicking projects from landing page (redirect to login if needed)

**Non-Goals:**
- Public project detail pages (full details remain protected)
- Public search/filtering of projects
- Public user profiles or browsing
- Analytics on landing page views
- Customizable landing page content

## Decisions

### 1. Route: `/` as Public Landing Page

**Decision:** Change root route to render public landing page instead of redirecting.

**Rationale:**
- Common pattern for web applications
- Provides natural entry point for new users
- Keeps all protected routes under `/projects`, `/sessions`, `/config`, etc.

**Alternatives considered:**
- `/landing` route, `/` redirects to `/projects` if authenticated: More routes, doesn't improve SEO/UX significantly
- `/welcome` route: Non-standard, harder to remember

**Implementation:**
```typescript
// In index.ts
app.get("/", async (c) => {
  const projects = await projectRepository.listAllPublic();
  return c.html(<LandingPage projects={projects} />);
});
```

### 2. Public Project Data Scope

**Decision:** Show only sanitized public data: name, description, repo type, owner, created date.

**Rationale:**
- Repo URLs could be private/reveal sensitive info
- Session counts add query complexity for public endpoint
- Basic info suffices for discoverability

**Not shown:**
- Repo URLs (may contain credentials or private repos)
- Session details
- Work-in-progress information

### 3. Project Description Field

**Decision:** Add `description?: string` as optional field, max ~200 characters recommended.

**Rationale:**
- Backwards compatible with existing projects
- Optional allows gradual adoption
- 200 chars fits on a card without truncation

**Implementation:**
```typescript
interface Project {
  // ... existing fields
  description?: string;  // Optional, displayed in cards
}

// In project.yaml
name: my-app
description: "A web application for..."
```

### 4. Public API Endpoint

**Decision:** Create `/api/projects/public` endpoint returning sanitized project array.

**Rationale:**
- Separates data fetching from rendering
- Enables future client-side features (search, filter)
- Clear contract for what's public vs private

**Alternatives considered:**
- Inline data in LandingPage SSR: Works but less flexible
- Full public API with filtering: Over-engineered for current needs

### 5. Click Behavior

**Decision:** Clicking a project card navigates to `/projects/:id`. Auth middleware handles redirect to login if needed.

**Rationale:**
- Reuses existing auth flow
- No special landing-page routing logic needed
- After login, user lands naturally on project detail

**Flow:**
```
Unauthenticated:
  Click project → /projects/:id → auth middleware → /auth/login?redirect=/projects/:id
  
Authenticated:
  Click project → /projects/:id → project detail page
```

## Risks / Trade-offs

**Risk:** Existing projects without descriptions look sparse on landing page.
→ **Mitigation:** Descriptions optional, show generic text if empty (e.g., "No description").

**Risk:** Public project list could reveal project names owners want private.
→ **Mitigation:** Document that projects are visible by default. Could add `private: boolean` field in future if needed.

**Risk:** Performance hit from listing all projects on landing page as system grows.
→ **Mitigation:** Start with all projects; add pagination when needed. Public endpoint returns array; can add limit/offset later.

**Risk:** Landing page design doesn't match MIMO's Emacs aesthetic.
→ **Mitigation:** Reuse Layout component styling; add hero section that fits existing dark theme.

**Trade-off:** No search/filter initially to keep scope manageable.
→ **Future:** Can add project search as separate change if landing page gets long.

## Migration Plan

1. **Deploy code changes** (no breaking changes):
   - Add description field (optional, backwards compatible)
   - Add landing page route
   - Add public API endpoint
   - Existing routes unchanged

2. **Update existing projects** (optional):
   - Users can add descriptions through project edit flow
   - No migration script needed

3. **No rollback needed** - all changes are additive

## Open Questions

1. **Should we show project count on landing page?** (e.g., "15 projects")
   - **Decision:** Yes, simple to add and provides context

2. **Should repo URLs ever be public?**
   - **Decision:** Not in this change. Keep protected. Could add `publicUrl` field later if needed.

3. **What text for projects without descriptions?**
   - **Decision:** Show "No description" in muted gray, matching empty state patterns