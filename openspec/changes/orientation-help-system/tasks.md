## 1. Setup

- [x] 1.1 Verify marked.min.js is vendored at `packages/mimo-platform/public/vendor/marked.min.js`
- [x] 1.2 Update Layout.tsx to include marked.js script tag
- [x] 1.3 Update Layout.tsx to include help-tooltip.js script tag
- [x] 1.4 Add tooltip CSS styles to Layout.tsx style block

## 2. Backend API

- [x] 2.1 Create help service at `src/help/service.ts` with `loadHelpContent()` function
- [x] 2.2 Create help routes at `src/help/routes.ts` with `GET /api/help` endpoint
- [x] 2.3 Mount help routes in `src/index.tsx` at `/api/help`
- [x] 2.4 Help content embedded in source code (src/help/defaults.ts) - no file I/O

## 3. Frontend Tooltip System

- [x] 3.1 Create `public/js/help-tooltip.js` with MarkdownRenderer seam interface
- [x] 3.2 Implement MarkedRenderer class using vendored marked.js
- [x] 3.3 Implement LightweightRenderer class as fallback option
- [x] 3.4 Create HelpTooltipManager class with event delegation
- [x] 3.5 Implement hover detection with 500ms delay using mouseenter/mouseleave
- [x] 3.6 Implement tooltip positioning relative to element
- [x] 3.7 Implement viewport collision detection for edge cases
- [x] 3.8 Implement tooltip hide with 200ms delay
- [x] 3.9 Add tooltip CSS styles (position, max-width, dark theme)
- [x] 3.10 Initialize tooltip system on DOMContentLoaded

## 4. ID Generation Script

- [x] 4.1 Create `scripts/generate-help-ids.ts` script scaffold
- [x] 4.2 Implement JSX parser to find interactive elements (a, button, input, select, etc.)
- [x] 4.3 Generate contextual IDs from component name and element context
- [x] 4.4 Inject `data-help-id` attributes into JSX files
- [x] 4.5 Generate skeleton help.yaml entries for discovered IDs
- [x] 4.6 Add CLI output showing summary of changes made
- [ ] 4.7 Test script on sample component files
- [ ] 4.8 Document script usage in AGENTS.md or README

## 5. Component Updates

- [x] 5.1 Run `bun run scripts/generate-help-ids.ts` to generate IDs
- [x] 5.2 Review generated IDs in DashboardPage.tsx
- [x] 5.3 Review generated IDs in SessionList.tsx
- [x] 5.4 Review generated IDs in Layout.tsx
- [x] 5.5 Review generated IDs in other page components
- [x] 5.6 Commit generated ID changes

## 6. Documentation

- [x] 6.1 Create sample `help.yaml` file with documentation for key UI elements
- [x] 6.2 Add help.yaml section to user documentation (skeleton created at ~/.mimo/help.yaml.example)
- [x] 6.3 Document tooltip system behavior (delays, positioning, markdown support)
- [x] 6.4 Document MarkdownRenderer seam for future parser swapping

## 7. Integration Testing

- [x] 7.1 Test tooltip appears on hover with valid help ID
- [x] 7.2 Test tooltip does not appear for missing help IDs (silent)
- [x] 7.3 Test tooltip positions correctly above elements
- [x] 7.4 Test tooltip adjusts position near viewport edges
- [x] 7.5 Test markdown rendering (bold, italic, code, links)
- [x] 7.6 Test 500ms show delay and 200ms hide delay
- [x] 7.7 Test with empty help.yaml returns empty object
- [x] 7.8 Test with invalid YAML returns 500 error

## 8. Verification

- [x] 8.1 Run full test suite: `cd packages/mimo-platform && bun run test.full`
- [x] 8.2 Verify no TypeScript errors: `bun run typecheck` (pre-existing errors only)
- [x] 8.3 Verify formatting: `prettier --check`
- [ ] 8.4 Test in browser manually
- [ ] 8.5 Review help.yaml sample with team
