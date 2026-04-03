## Why

MIMO currently lacks a public landing page. Users are immediately redirected to login, giving no opportunity to learn about the platform or see what projects exist before committing to authentication. A landing page would improve the new user experience, provide a gentle introduction to the platform, and allow showcasing public project information.

## What Changes

- **NEW**: Public landing page at `/` route
  - Shows platform description and features
  - Displays public project list (names, descriptions, owners, repo types)
  - Login and Register buttons in header
  - Clicking a project redirects to login if not authenticated, or project detail if authenticated

- **NEW**: Project `description` field (optional, max ~200 chars)
  - Added to Project interface and YAML storage
  - Shown on landing page cards and project detail page
  - Not required for project creation (backwards compatible)

- **NEW**: Public project listing API (`GET /api/projects/public`)
  - Returns sanitized project data (no repo URLs)
  - Used for landing page SSR or client fetch

- **MODIFIED**: Route structure
  - `/` now renders LandingPage (public)
  - `/projects` remains protected dashboard (full project management)
  - `/projects/:id` remains protected (full project details)

## Capabilities

### New Capabilities

- `landing-page`: Public landing page with platform overview, project listing, and auth CTAs
- `project-descriptions`: Optional description field for projects, displayed in cards and details

### Modified Capabilities

- `projects`: Add optional description field to project model, expand public visibility

## Impact

**Files Created:**
- `src/components/LandingPage.tsx` - Public landing page component
- `src/projects/public.ts` - Public project listing endpoint

**Files Modified:**
- `src/index.ts` - Add GET `/` route for landing page
- `src/projects/repository.ts` - Add description field to Project interface
- `src/projects/routes.tsx` - Add public listing endpoint, update project creation
- `src/components/ProjectsListPage.tsx` - Show description in cards
- `src/components/ProjectDetailPage.tsx` - Show description in header
- `src/components/ProjectCreatePage.tsx` - Add description input field

**Breaking Changes:** None - all changes are additive, existing functionality preserved