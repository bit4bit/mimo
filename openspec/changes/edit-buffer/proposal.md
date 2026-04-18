## Why

Users need a quick way to browse, open, and navigate through files in the codebase while working in a session. Currently, there's no built-in file browsing capability - users must rely on external tools or manual file navigation.

## What Changes

- Add a file finder dialog accessible via `Mod+Shift+F` keybinding
- Allow multiple files to be open simultaneously in an "edit buffer"
- Navigate between open files using `Mod+Shift+ArrowRight` and `Mod+Shift+ArrowLeft`
- Display file contents with syntax highlighting
- Support scrolling through file contents with PageUp and PageDown keys

## Capabilities

### New Capabilities

- `file-finder`: Open a searchable dialog to find files by pattern matching
- `edit-buffer`: Display and manage multiple open files with tabs
- `file-navigation`: Switch between open files via keyboard shortcuts
- `file-viewer`: Display file contents with syntax highlighting and keyboard scrolling

### Modified Capabilities

- `session-keybindings`: Add new keybindings for file finder and file navigation

## Impact

- `packages/mimo-platform/src/buffers/EditBuffer.tsx`: New buffer component for viewing/editing files
- `packages/mimo-platform/src/components/FileFinderDialog.tsx`: New dialog component for file search
- `packages/mimo-platform/public/js/session-keybindings.js`: Add keybinding handlers
- `packages/mimo-platform/src/config/service.ts`: Add new keybinding defaults
- `packages/mimo-platform/src/buffers/index.ts`: Register new buffer type
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`: Add file finder dialog and edit buffer integration
