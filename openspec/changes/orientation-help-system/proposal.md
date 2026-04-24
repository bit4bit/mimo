## Why

Users need contextual documentation to understand UI elements without leaving the interface. Currently, there's no way to discover what buttons, inputs, or status indicators do without trial and error. An orientation help system that shows tooltips on hover—with documentation from a local `help.yaml`—provides immediate, contextual guidance.

## What Changes

- **New**: `~/.mimo/help.yaml` file where users define documentation entries with markdown content
- **New**: `GET /api/help` endpoint that reads and serves help.yaml content as JSON (no caching)
- **New**: `public/js/help-tooltip.js` - frontend module for tooltip display with event delegation
- **New**: `public/vendor/marked.min.js` - vendored markdown parser (already downloaded)
- **New**: `scripts/generate-help-ids.ts` - automated script that scans JSX files, injects `data-help-id` attributes, and generates skeleton help.yaml entries
- **New**: `MarkdownRenderer` seam interface allowing parser swapping
- **Modified**: `Layout.tsx` - include help-tooltip.js script tag and tooltip CSS
- **Modified**: All JSX components (via script) - add `data-help-id` attributes to interactive elements

## Capabilities

### New Capabilities
- `orientation-help`: Contextual documentation tooltips on hover, loaded from local help.yaml with markdown rendering and configurable display delays

### Modified Capabilities
<!-- No existing capabilities require spec-level changes -->

## Impact

- **Dependencies**: Adds `marked.js` (~40KB) to public/vendor (already downloaded)
- **API**: New `/api/help` endpoint (unprotected, read-only)
- **Frontend**: New global tooltip manager attached to document body
- **User files**: Reads from `~/.mimo/help.yaml` in user's home directory
- **Build**: New dev script `bun run scripts/generate-help-ids.ts` for one-time ID generation
