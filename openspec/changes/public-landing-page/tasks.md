# Tasks: public-landing-page

## 1. Project Model Update

- [x] 1.1 Add `description?: string` field to Project interface in `repository.ts`
- [x] 1.2 Update ProjectData interface to include optional description
- [x] 1.3 CreateProjectInput interface to include optional description
- [x] 1.4 Update YAML serialization to handle optional description field
- [x] 1.5 Add description validation (max 500 chars, recommended ~200)

## 2. Public Project API

- [x] 2.1 Create `listAllPublic()` method in ProjectRepository
- [x] 2.2 Create public project type with sanitized fields (no repoUrl)
- [x] 2.3 Add `GET /api/projects/public` route (no auth required)
- [x] 2.4 Return empty array gracefully when no projects exist
- [x] 2.5 Add tests for public API endpoint

## 3. Landing Page Component

- [x] 3.1 Create `LandingPage.tsx` component
- [x] 3.2 Add hero section with platform title and description
- [x] 3.3 Add features list (Emacs-style UI, sessions, AI integration, file sync)
- [x] 3.4 Add project list section with cards
- [x] 3.5 Add Login and Register buttons in header area
- [x] 3.6 Handle authenticated state (show username, Logout, Create Project)
- [x] 3.7 Add "No description" placeholder for projects without description
- [x] 3.8 Truncate long descriptions (>200 chars) with ellipsis

## 4. Landing Page Route

- [x] 4.1 Add `GET /` route in `index.ts`
- [x] 4.2 Fetch public projects and render LandingPage
- [x] 4.3 Make route public (no auth middleware)
- [x] 4.4 Show project count on page

## 5. Project Card Links

- [x] 5.1 Add click handler to project cards
- [x] 5.2 Navigate to `/projects/:id` on click
- [x] 5.3 Auth middleware handles redirect to login if needed
- [x] 5.4 Test unauthenticated click redirects to login with redirect param
- [x] 5.5 Test authenticated click goes to project detail

## 6. Update Project Forms

- [x] 6.1 Add description textarea to project creation form
- [x] 6.2 Add description field to project edit/update form
- [x] 6.3 Pre-fill existing description when editing
- [x] 6.4 Make description field optional in validation
- [x] 6.5 Add placeholder text "Describe your project..."

## 7. Update Project Displays

- [x] 7.1 Update ProjectsListPage to show description in cards
- [x] 7.2 Update ProjectDetailPage to show description in header
- [x] 7.3 Update project list/dashboard to show description
- [x] 7.4 Add description to project YAML serialization/deserialization

## 8. Styling and Layout

- [x] 8.1 Style landing page to match MIMO dark theme
- [x] 8.2 Reuse Layout component for consistent styling
- [x] 8.3 Style project cards with name, description, owner, repo type badge
- [x] 8.4 Add hover effects for project cards
- [x] 8.5 Style hero section appropriately
- [x] 8.6 Make landing page responsive

## 9. Integration Testing

- [x] 9.1 Test landing page loads without auth
- [x] 9.2 Test public API returns sanitized project data
- [x] 9.3 Test project cards link correctly
- [x] 9.4 Test description display in all project views
- [x] 9.5 Test authenticated vs unauthenticated landing page
- [x] 9.6 Test empty state (no projects)
- [x] 9.7 Test projects without descriptions show "No description"

## 10. Migration and Compatibility

- [x] 10.1 Verify existing projects without description load correctly
- [x] 10.2 Ensure no breaking changes to existing routes
- [x] 10.3 Update README if needed to document public landing page
- [x] 10.4 Add tests for backwards compatibility