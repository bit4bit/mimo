## Tasks

### Proposal
- [x] Create `openspec/changes/edit-buffer/proposal.md` with feature overview

### Design
- [x] Create `openspec/changes/edit-buffer/design.md` with component architecture

### Specs
- [x] Create `openspec/changes/edit-buffer/specs/file-finder/spec.md` with detailed requirements

### Tasks
- [x] Create `openspec/changes/edit-buffer/tasks.md` (this file)

### Implementation

#### 1. Configuration Updates
- [ ] Update `packages/mimo-platform/src/config/service.ts`
  - Add `openFileFinder`, `closeFile` keybinding defaults
  - Add keybinding type definitions
  - Add validation for new keybindings

- [ ] Update `packages/mimo-platform/src/config/validator.ts`
  - Add `openFileFinder`, `closeFile` to valid keybindings list

#### 2. API Endpoint
- [ ] Create `packages/mimo-platform/src/files/routes.ts`
  - Add GET `/api/sessions/:id/files` endpoint
  - Returns list of files in session workspace
  - Supports pattern filtering query param

- [ ] Create `packages/mimo-platform/src/files/service.ts`
  - Implement `listFiles()` function
  - Implement `readFile()` function
  - Pure functions with explicit dependencies

#### 3. Core Components

##### 3.1 Syntax Highlighting Module (using highlight.js)
- [ ] Create `packages/mimo-platform/src/files/syntax-highlighter.ts`
  - `detectLanguage(filePath: string): string` - detect language from extension
  - `highlightContent(content: string, language: string): string` - use hljs.highlight()
  - Support 190+ languages via highlight.js
  - Server-side: escape HTML (client-side highlighting)
  - Client-side: call hljs.highlight() on content
  - Include `escapeHtml()` helper for server-side rendering

##### 3.1b Layout Integration (highlight.js CDN)
- [ ] Update `packages/mimo-platform/src/components/Layout.tsx`
  - Add highlight.js CDN script in `<head>`:
    - `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js`
    - `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css`
  - Add `useEffect` or inline script to initialize hljs on edit buffer mount
  - Ensure hljs available globally for EditBuffer component

##### 3.2 File Service
- [ ] Create `packages/mimo-platform/src/files/service.ts`
  - `findFiles(pattern: string, fileService: FileService): Promise<FileInfo[]>`
  - `matchesPattern(filePath: string, pattern: string): boolean`
  - Pure functions only

##### 3.3 Dialog Component
- [ ] Create `packages/mimo-platform/src/components/FileFinderDialog.tsx`
  - Props: `isOpen`, `files`, `selectedIndex`, `searchPattern`, callbacks
  - Render modal with search input and file list
  - Display file name, path, and icon
  - Highlight selected item
  - Inline styles (no CSS file)

##### 3.4 EditBuffer Component (ChatThreadsBuffer Pattern)
- [ ] Create `packages/mimo-platform/src/buffers/EditBuffer.tsx`
  - **Follow ChatThreadsBuffer.tsx structure exactly:**
  - Tab bar at top with horizontal scroll
  - Each tab shows file icon + filename (not full path)
  - Active tab has distinct background color (#1a1a1a)
  - Inactive tabs have transparent background
  - "+ Open File" button after tabs (opens file finder)
  - **"Close" button on far right** (like Delete button in ChatThreadsBuffer)
  - Use flexbox with `flex: 1` spacer to push close button right
  - Context bar below tabs (show file path, line count, language)
  - File content view (scrollable with line numbers + syntax highlighting)
  - Render empty state when no files open

##### 3.5 Styling (Mirror ChatThreadsBuffer)
- [ ] Apply ChatThreadsBuffer styling patterns:
  - Tab bar: `background: #2d2d2d`, `border-bottom: 1px solid #444`
  - Tab: `padding: 8px 16px`, `border-right: 1px solid #444`
  - Tab font: `font-family: monospace`, `font-size: 12px`
  - Active tab: `background: #1a1a1a`, `color: #d4d4d4`
  - Inactive tab: `background: transparent`, `color: #888`
  - Hover: `background: #353535`
  - Close button: styled like Delete button in ChatThreadsBuffer
  - Context bar: `background: #252525`, `padding: 8px 12px`

##### 3.6 File Content Component
- [ ] Create inline in EditBuffer or separate component
  - Display line numbers
  - Display syntax highlighted content
  - Scrollable container
  - Handle PageUp/PageDown

#### 4. Client-Side JavaScript

##### 4.1 Keybinding Updates
- [ ] Update `packages/mimo-platform/public/js/session-keybindings.js`
  - Add `openFileFinder`, `closeFile` to DEFAULT_KEYBINDINGS
  - Add `isFileFinderOpen()` function
  - Add `openFileFinder()` function
  - Add `closeFileFinder()` function
  - Add `switchFile(direction)` function
  - Add `closeCurrentFile()` function
  - Add handlers for PageUp/PageDown in edit buffer

##### 4.2 File Finder Logic
- [ ] Create inline in session-keybindings.js or separate file
  - Fetch file list from API
  - Filter based on search input
  - Handle keyboard navigation
  - Open selected file in EditBuffer

##### 4.3 Edit Buffer State Management
- [x] Create inline in edit-buffer.js
  - Store open files in JS closure state (`EditBufferState`)
  - Track active file index
  - Handle tab switching
  - Handle file closing

##### 4.4 Ignore File Filtering
- [ ] Update `packages/mimo-platform/src/files/service.ts`
  - Add `loadIgnorePatterns(workspacePath: string): string[]` — reads `.gitignore` and `.mimoignore` from workspace root, returns combined pattern lines (skip blanks and `#` comments)
  - Add `applyIgnorePatterns(files: FileInfo[], patterns: string[]): FileInfo[]` — pure function, filters out files matching any pattern
  - Call both in `listFiles()` after `fossilLs()` output is mapped to `FileInfo[]`
- [ ] Update `packages/mimo-platform/test/files-service.test.ts`
  - Test `applyIgnorePatterns` with glob patterns (`*.log`, `dist/**`, `node_modules/`)
  - Test `applyIgnorePatterns` with negation patterns (`!important.log`)
  - Test `applyIgnorePatterns` with path-anchored patterns (`src/generated/`)
  - Test `loadIgnorePatterns` skips blank lines and comments
  - Test `loadIgnorePatterns` combines both files when both exist
  - Test `loadIgnorePatterns` returns empty array when neither file exists

##### 4.5 Open-File Persistence (localStorage)
- [ ] Update `packages/mimo-platform/public/js/edit-buffer.js`
  - Add `persistState()` — writes `{ openPaths, activePath }` to `localStorage` key `mimo:edit-buffer:<sessionId>`
  - Call `persistState()` on every add, remove, and setActive operation
  - Add `restoreState()` — on `DOMContentLoaded`, reads stored state, fetches each path via `/sessions/:id/files/content`, restores tabs and active file in order
  - Skip paths that return a non-OK HTTP status (deleted/renamed files)
  - After restore, if the active frame is not already "edit", do not auto-switch (preserve user's last active buffer)

#### 5. Integration

##### 5.1 Buffer Registration
- [ ] Update `packages/mimo-platform/src/buffers/index.ts`
  - Register EditBuffer with id 'edit'
  - Assign to 'left' frame
  - Add to default buffer configs

##### 5.2 Session Detail Page
- [ ] Update `packages/mimo-platform/src/components/SessionDetailPage.tsx`
  - Add FileFinderDialog to layout
  - Pass file finder props
  - Add styles for dialog and edit buffer

##### 5.3 Keybindings Display
- [ ] Update `packages/mimo-platform/src/components/SessionDetailPage.tsx`
  - Add file finder keybinding to shortcuts bar
  - Add file navigation keybinding to shortcuts bar

#### 6. Testing

##### 6.1 Unit Tests
- [ ] Create `packages/mimo-platform/test/files-service.test.ts`
  - Test `findFiles()` with various patterns
  - Test `matchesPattern()` edge cases
  - Test `detectLanguage()` for all supported extensions
  - Test `highlightSyntax()` output

##### 6.2 Integration Tests
- [ ] Create `packages/mimo-platform/test/edit-buffer.test.ts`
  - Test opening file finder with keybinding
  - Test typing filters files
  - Test Enter opens file
  - Test Escape closes dialog
  - Test multiple files open
  - Test keyboard navigation between files
  - Test PageUp/PageDown scrolling

##### 6.3 Component Tests
- [ ] Create `packages/mimo-platform/test/file-finder-dialog.test.tsx`
  - Test FileFinderDialog renders correctly
  - Test props are handled correctly

#### 7. Documentation

##### 7.1 Code Documentation
- [ ] Add JSDoc to all exported functions
- [ ] Document component props
- [ ] Document keybinding configuration options

##### 7.2 Update AGENTS.md (if needed)
- [ ] Document new file service patterns
- [ ] Document syntax highlighting approach

## Verification Steps

### UI Verification (Chat threads style)

1. Start the platform
2. Open a session
3. Navigate to EditBuffer (if not default)
4. **Verify UI matches ChatThreadsBuffer pattern:**
   - Tab bar at top with dark background (#2d2d2d)
   - Tabs show file icon + filename only
   - Active tab has dark background (#1a1a1a)
   - "+ Open File" button visible after tabs
   - **"Close" button on far right of tab bar**
   - Context bar below tabs showing file metadata

5. Press `Mod+Shift+F` - file finder dialog should open
6. Type to filter files
7. Use ArrowUp/ArrowDown to navigate
8. Press Enter to open a file
9. **Verify file appears as new tab in the tab bar**
10. Open multiple files
11. **Verify tabs scroll horizontally if many files open**
12. Use `Mod+Shift+ArrowRight/Left` to switch between files
13. Use PageUp/PageDown to scroll file content
14. **Click the "Close" button on right side to close active file**
15. Verify shortcuts bar shows new keybindings

### Styling Verification

- [ ] Tab bar matches ChatThreadsBuffer styling
- [ ] File icons displayed on tabs (based on file type)
- [ ] Active tab visually distinct
- [ ] Close button positioned at far right
- [ ] Context bar shows file info (path, lines, language)
- [ ] Content area has line numbers and syntax highlighting

## Files Created/Modified

### New Files
- `packages/mimo-platform/src/files/routes.ts`
- `packages/mimo-platform/src/files/service.ts`
- `packages/mimo-platform/src/files/syntax-highlighter.ts`
- `packages/mimo-platform/src/files/types.ts`
- `packages/mimo-platform/src/components/FileFinderDialog.tsx`
- `packages/mimo-platform/src/buffers/EditBuffer.tsx`
- `packages/mimo-platform/test/files-service.test.ts`
- `packages/mimo-platform/test/edit-buffer.test.ts`

### Modified Files
- `packages/mimo-platform/src/config/service.ts`
- `packages/mimo-platform/src/config/validator.ts`
- `packages/mimo-platform/src/buffers/index.ts`
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`
- `packages/mimo-platform/public/js/session-keybindings.js`
