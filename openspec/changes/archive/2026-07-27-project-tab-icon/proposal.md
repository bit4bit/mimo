## Why

When several mimo tabs are open, they are hard to tell apart: every page renders the same default browser favicon and a title of the form `<page> | MIMO`. There is no per-project visual identity, so users scan text to find the right tab. Deriving a deterministic icon (color + glyph) from each project gives every project a stable, recognizable identity across tabs, sessions, and reloads, with zero storage or migration.

## What Changes

- Generate a per-project favicon as an inline SVG data URI, derived deterministically from `project.id` (hue) and `project.name` (glyph).
- Inject the favicon `<link rel="icon">` into the document `<head>` from the shared `Layout` component for any page bound to a project.
- Pages without an active project (dashboard, project list, auth) keep a default MIMO favicon.
- Reserve optional override fields on the `Project` model (`color?`, `iconGlyph?`) for a future user-customization flow; not exposed in the UI in this change.
- No new persisted state, no migrations, no new external assets.

## Capabilities

### New Capabilities
- `project-tab-icon`: Deriving and rendering a deterministic per-project browser-tab favicon (color + glyph) from project identity.

### Modified Capabilities
- `project-management`: The `Project` entity reserves optional `color` and `iconGlyph` override fields used by the favicon generator.

## Impact

- `packages/mimo-platform/src/web/shared/components/Layout.tsx`: add favicon `<link>` to `<head>`, threaded with project id/name.
- New pure helper module for favicon generation (hash → hue, name → glyph, SVG → data URI). No I/O, no globals.
- `packages/mimo-platform/src/domain/projects/repository.ts`: extend `Project` / `ProjectData` / `PublicProject` interfaces with optional `color?` and `iconGlyph?`; repository passes them through unchanged when unset.
- Pages already passing `projectId` to `Layout` require no changes; pages that have a project context but do not currently forward `projectId`/`projectName` to `Layout` must be updated.
- No API contract changes beyond the optional, backward-compatible fields.