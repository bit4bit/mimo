## Why

The existing fileFinder (Ctrl+P) only searches by filename, but users often need to find code by its content - function names, variable references, error messages, or specific patterns. This requires jumping to a terminal to run `grep` or `ripgrep`, breaking the flow. A contentFinder dialog brings content search directly into the editor.

## What Changes

- Add new keyboard shortcut Alt+Shift+C to open contentFinder dialog
- New modal dialog for searching file contents with live results
- Backend API endpoint `GET /sessions/:sessionId/search` for content search
- New service layer that wraps ripgrep for fast content searching
- Results show file path, line number, and context preview (2 lines before/after)
- Matching text highlighted in preview snippets
- Tab/Arrow navigation through results, Enter to open file at match position
- Debounced search (300ms) while typing
- Error handling for: invalid regex patterns, no matches, ripgrep not installed

## Capabilities

### New Capabilities
- `content-search`: Search file contents within a session workspace using ripgrep

### Modified Capabilities
- (none - this is a purely additive feature)

## Impact

- **Frontend**: `packages/mimo-platform/public/js/edit-buffer.js` - add contentFinder dialog UI, keyboard handler
- **Backend**: `packages/mimo-platform/src/sessions/routes.tsx` - add search endpoint
- **New Module**: `packages/mimo-platform/src/files/search-service.ts` - ripgrep wrapper
- **Types**: `packages/mimo-platform/src/files/types.ts` - add ContentSearchResult type
- **Dependencies**: Requires `ripgrep` (rg) binary installed on host system
