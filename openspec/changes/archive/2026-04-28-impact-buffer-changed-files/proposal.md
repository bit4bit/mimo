## Why

ImpactBuffer shows counts (new/changed/deleted) but not which files changed.
Users have no way to quickly navigate to a changed file without leaving the impact view.

## What Changes

- **Changed Files section in ImpactBuffer**: List all non-unchanged files from `metrics.byFile` with status badge (new/changed/deleted)
- **Click-to-open**: Clicking a file row opens it in EditBuffer directly (no file-finder dialog)
- **Expose `openFile` on `window.EditBuffer`**: New public API for programmatic file opening by path

## Capabilities

### Modified Capabilities
- `impact-buffer-ui`: Add "Changed Files" section below existing metrics, showing clickable file rows
- `edit-buffer-api`: Expose `openFile(path)` on `window.EditBuffer` for cross-component use

## Impact

- `packages/mimo-platform/public/js/chat.js`: Add changed-files section in `renderImpactMetrics()`
- `packages/mimo-platform/public/js/edit-buffer.js`: Expose `openFile(path)` on `window.EditBuffer`
- `packages/mimo-platform/src/components/ImpactBuffer.tsx`: Add CSS for clickable file rows
