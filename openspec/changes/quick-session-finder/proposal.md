## Why

Navigating to a session requires clicking through the Projects page, selecting a project, then finding the session in the table. With many projects and sessions, this is slow. A global fuzzy finder lets users jump directly to any session from any page in one keystroke.

## What Changes

- New global keybinding `openSessionFinder` (default `Control+Shift+S`) available on every page
- New `GET /sessions/search?q=` API endpoint: returns recent sessions (empty query) or substring-matched sessions by name or project name
- New `SessionFinderDialog` component rendered in `Layout.tsx` on all pages
- New `session-finder.js` client script: handles open/close, fetch, Tab-cycle, Enter-navigate, Esc-close
- `GlobalKeybindingsConfig` gains `openSessionFinder` key — configurable via YAML

## Capabilities

### New Capabilities

- `session-finder`: Global keyboard-driven session search dialog — fuzzy input, Tab-cycle results, Enter opens session

### Modified Capabilities

- `session-management`: New search endpoint added to session API surface

## Impact

- `packages/mimo-platform/src/config/service.ts` — add `openSessionFinder` to `GlobalKeybindingsConfig` and defaults
- `packages/mimo-platform/src/sessions/routes.tsx` — add `GET /sessions/search` route (before `/:id`)
- `packages/mimo-platform/src/components/SessionFinderDialog.tsx` — new component
- `packages/mimo-platform/src/components/Layout.tsx` — render dialog + load script on all pages
- `packages/mimo-platform/public/js/session-finder.js` — new client script
- `packages/mimo-platform/public/js/session-keybindings.js` — register `openSessionFinder` global keybinding
