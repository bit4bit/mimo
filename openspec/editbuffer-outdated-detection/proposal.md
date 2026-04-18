# Proposal: EditBuffer Outdated File Detection

## Summary
Enhance the EditBuffer component to detect when opened files are modified externally and notify the user with the ability to reload the file content.

## Motivation
Currently, when a user has a file open in the EditBuffer and that file is modified by an external process (e.g., agent making changes, git operations, other editors), the user sees stale content without any indication that the file has changed. This can lead to:
- Working with outdated code
- Confusion about the actual state of files
- Overwriting external changes when saving

## Proposed Solution
Implement a file watching mechanism that:
1. Monitors all currently opened files for external changes
2. Detects when a file's content on disk differs from the loaded content
3. Displays a notification banner in the EditBuffer context bar
4. Provides a reload action via button and keyboard shortcut (Alt+Shift+R)
5. Preserves scroll position after reload

## Technical Approach
- Use **chokidar** for efficient filesystem watching on the server
- WebSocket or Server-Sent Events to push file change notifications to the client
- Minimal changes to existing EditBuffer components and state management
- Follow existing patterns for keybindings (Alt+Shift+R for reload)

## Success Criteria
- [ ] When an opened file is modified externally, user sees an "outdated" indicator
- [ ] User can reload the file by clicking a button in the context bar
- [ ] User can reload the file using Alt+Shift+R keyboard shortcut
- [ ] Scroll position is preserved after reload
- [ ] File watching is efficient and doesn't impact performance
- [ ] Works for all file types supported by the EditBuffer

## Out of Scope
- Auto-reload functionality (user must explicitly choose to reload)
- Conflict resolution UI for files with unsaved changes
- Watching files not currently open in the EditBuffer
