# UI Page Requirements

Every new page must follow these standards.

## Component Structure

- Extend `Layout` with correct `title`
- Render inside consistent max-width container:
  - 800px for list/detail pages
  - 400px for forms
- Use standard classes: `.btn`, `.btn-secondary`, `.form-group`, etc.

## Form Requirements

- Use `method="post"` (lowercase)
- Include both Cancel and Submit
- Show validation errors in `.error-message`
- Include help text with `.form-help`

## Page Standards

- List pages: max-width 800px, title bar with action button
- Form pages: max-width 400px, consistent field styling
- Detail pages: max-width 800px, organized sections

## Key Spec Locations

- `openspec/specs/vcs-credentials/spec.md`
- `openspec/specs/projects/spec.md`
- `openspec/specs/<capability>/spec.md`

## Never Skip

- Write tests first (BDD)
- Create OpenSpec artifacts before implementing
- Use `Layout` for all pages
- Follow UI standards from specs
- Verify before archiving
