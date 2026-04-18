## Context

The session page uses a frame-based buffer system with buffers registered per frame. The existing keybinding system in `session-keybindings.js` handles keyboard shortcuts like `Mod+Shift+N` for new threads, `Mod+Shift+ArrowRight/Left` for thread switching.

Key files:
- `packages/mimo-platform/src/buffers/types.ts`: BufferProps interface and BufferConfig
- `packages/mimo-platform/src/buffers/`: Existing buffer components (ChatBuffer, NotesBuffer, etc.)
- `packages/mimo-platform/public/js/session-keybindings.js`: Client-side keyboard handling
- `packages/mimo-platform/src/config/service.ts`: Keybinding configuration

## Goals / Non-Goals

**Goals:**
- Clean, reusable component architecture using functional paradigm
- Minimal code duplication
- Easy to read and understand (prioritize clarity over optimization)
- Follow existing patterns in the codebase

**Non-Goals:**
- File editing/saving (read-only view for now)
- Advanced editor features (folding, minimap, etc.)
- File system operations (create, delete, rename)
- Complex fuzzy search algorithms (simple pattern matching)

## Component Architecture

Following the ChatThreadsBuffer design pattern (with close button in context bar):

```
┌─────────────────────────────────────────────────────────────────┐
│                      EditBuffer                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   File Tabs Bar                           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐ │  │
│  │  │file1.ts │ │file2.ts │ │file3.ts │ │ + Open File   │ │  │
│  │  │   ●     │ │         │ │         │ └───────────────┘ │  │
│  │  └─────────┘ └─────────┘ └─────────┘                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  File Context Bar                         │  │
│  │  File: src/utils/helpers.ts          Lines: 42            │  │
│  │  Language: TypeScript                           [✕ Close] │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  File Content View                        │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  1  │ import { FC } from "hono/jsx";               │  │  │
│  │  │  2  │                                              │  │  │
│  │  │  3  │ export const helper = () => {                │  │  │
│  │  │  4  │   return "highlighted";                      │  │  │
│  │  │ ... │                                              │  │  │
│  │  │     │                                              │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                    (scrollable area)                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
│  ┌─────────────────────────┐                                    │
│  │ FileFinderDialog        │                                    │
│  │ (mod+shift+f opens)     │                                    │
│  └─────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Design Pattern (refined from ChatThreadsBuffer)

1. **File Tabs Bar** (like Thread Tabs):
   - Horizontal scrollable tab bar
   - Each tab shows filename with active indicator
   - "+ Open File" button after tabs (opens file finder)
   - **No close button in tabs bar** (moved to context bar)

2. **File Context Bar** (like Thread Context Bar):
   - Shows file metadata: full path, line count, file size
   - Language indicator
   - **"Close" button on the far right side** (like Delete button in ChatThreadsBuffer)
   - Uses `flex: 1` spacer to push button to right

3. **File Content View** (like Chat Messages):
   - Line numbers on the left
   - Syntax highlighted code
   - Scrollable with pgup/pgdown support

4. **FileFinderDialog** (Modal):
   - Search input at top
   - Filtered file list below
   - Keyboard navigable (arrows + enter)
   - Escape to close

## Decisions

### D1: Pure Functions for File Operations

**Decision**: Implement file operations as pure functions that take dependencies as arguments.

```typescript
// File service - pure functions
export interface FileService {
  readFile: (path: string) => Promise<string>;
  listFiles: (pattern: string) => Promise<FileInfo[]>;
}

export const findFiles = async (
  pattern: string,
  fileService: FileService
): Promise<FileInfo[]> => {
  const files = await fileService.listFiles("*");
  return files.filter((file) => matchesPattern(file.path, pattern));
};
```

**Rationale**: Enables easy testing, clear dependencies, follows functional paradigm.

### D2: Stateless Dialog Component

**Decision**: FileFinderDialog is a pure UI component that receives all state via props and reports events via callbacks.

```typescript
interface FileFinderDialogProps {
  isOpen: boolean;
  files: FileInfo[];
  selectedIndex: number;
  searchPattern: string;
  onSearchChange: (pattern: string) => void;
  onSelect: (file: FileInfo) => void;
  onCancel: () => void;
  onNavigate: (direction: "up" | "down") => void;
}
```

**Rationale**: No internal state means predictable behavior, easy to test, clear data flow.

### D3: Use highlight.js for Syntax Highlighting

**Decision**: Use highlight.js library for syntax highlighting instead of custom regex-based solution.

```typescript
// Include highlight.js in Layout.tsx for all pages
// <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
// <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">

// File: packages/mimo-platform/src/files/syntax-highlighter.ts
export const detectLanguage = (filePath: string): string => {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    html: "html",
    css: "css",
    py: "python",
    rs: "rust",
    go: "go",
  };
  return langMap[ext] || "plaintext";
};

export const highlightContent = (
  content: string,
  language: string
): string => {
  // Use hljs from global scope (loaded via CDN)
  if (typeof window !== "undefined" && (window as any).hljs) {
    const hljs = (window as any).hljs;
    try {
      const result = hljs.highlight(content, { language });
      return result.value;
    } catch {
      // Fallback to plain text if language not supported
      return escapeHtml(content);
    }
  }
  // Server-side: return escaped HTML (will be highlighted client-side)
  return escapeHtml(content);
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};
```

**Rationale**: 
- highlight.js is battle-tested with support for 190+ languages
- Provides consistent, professional syntax highlighting
- Atom One Dark theme matches the existing dark UI
- Automatic language detection available as fallback
- Zero custom code to maintain for highlighting logic

### D4: Buffer State Management

**Decision**: EditBuffer manages its own list of open files in JavaScript state and persists the open file paths (not content) to `localStorage`, keyed by session ID. On page load the stored paths are restored by re-fetching each file's content from the existing `/sessions/:id/files/content` API.

```typescript
// State shape in JS memory
interface EditBufferState {
  openFiles: Array<{
    path: string;
    name: string;
    content: string;
    language: string;
    lineCount: number;
    scrollPosition: number;
  }>;
  activeIndex: number;
}

// localStorage key: `mimo:edit-buffer:<sessionId>`
// Stored value (JSON):
interface PersistedEditBufferState {
  openPaths: string[];   // ordered list of open file paths
  activePath: string | null;
}
```

Persistence rules:
- Persist **paths only** — content is always re-fetched to stay fresh.
- Storage key: `mimo:edit-buffer:<sessionId>` (session-scoped, no cross-session leakage).
- Write to `localStorage` on every add/remove/switch operation.
- On `DOMContentLoaded`, read the stored state, fetch each path sequentially, then restore active file.
- If a stored path no longer exists on the server (fetch returns 404/error), skip silently and remove from storage.

**Rationale**: Users expect their open files to survive a page refresh. Paths are cheap to store; re-fetching content avoids stale cached content and keeps the storage footprint minimal.

### D5: Keyboard Navigation in Dialog

**Decision**: Use arrow keys for list navigation, Enter to select, Escape to close.

**Rationale**: Standard UX pattern, matches existing codebase patterns (see commit dialog).

### D6: No Virtual Scrolling

**Decision**: Use native scroll behavior with `overflow: auto` for file content.

**Rationale**: Simplicity over optimization. File contents are typically not large enough to require virtualization.

### D7: Ignore File Filtering

**Decision**: After obtaining the file list from `fossil ls`, filter out paths that match patterns in `.gitignore` and/or `.mimoignore` found at the workspace root. Both files use the same gitignore pattern syntax. Filtering happens server-side in `files/service.ts`.

```typescript
// Pure function — takes file list and raw ignore content, returns filtered list
export function applyIgnorePatterns(
  files: FileInfo[],
  ignorePatterns: string[],  // combined lines from .gitignore + .mimoignore
): FileInfo[]

// Reads .gitignore and .mimoignore from workspacePath, returns combined pattern lines
export function loadIgnorePatterns(workspacePath: string): string[]
```

Pattern matching rules (subset of gitignore spec sufficient for practical use):
- Lines starting with `#` are comments — skip.
- Blank lines are skipped.
- A leading `!` negates a pattern — matched files are re-included.
- A pattern containing `/` is matched against the full path; otherwise matched against the filename only.
- `*` matches any sequence of characters except `/`.
- `**` matches any sequence of characters including `/`.
- Trailing `/` means directory-only match — skip (files only in this context).

**Rationale**: Users frequently have generated files, `node_modules`, build artifacts, and secrets in their workspace that should not appear in the file finder. `.gitignore` is the standard mechanism; `.mimoignore` provides mimo-specific overrides without modifying the project's `.gitignore`. Server-side filtering keeps the client simple and prevents leaking ignored paths over the API.

## Risks / Trade-offs

- **Large file handling**: Loading large files into memory could be slow. → Accept for MVP, consider lazy loading later.
- **Syntax highlighting performance**: Simple regex-based highlighting may not handle all edge cases. → Acceptable for read-only viewing.
- **Stale content on restore**: File content is re-fetched on restore, so it always reflects the current workspace state.
- **localStorage quota**: Paths are tiny strings; quota exhaustion is not a realistic risk.
- **Deleted files**: If a persisted path no longer exists, the restore silently skips it.

## Data Flow

### Opening File Finder

1. User presses `Mod+Shift+F`
2. `session-keybindings.js` catches key, triggers `openFileFinder()`
3. JavaScript sets `data-file-finder-open="true"` on dialog
4. Dialog fetches file list from `/api/files` endpoint
5. Dialog displays with focus on search input

### Selecting a File

1. User types pattern, sees filtered results
2. User navigates with ArrowUp/ArrowDown
3. User presses Enter
4. Dialog calls `onSelect(file)` callback
5. Parent closes dialog, adds file to EditBuffer state
6. EditBuffer renders new file content

### Switching Between Open Files

1. User presses `Mod+Shift+ArrowRight/Left`
2. `session-keybindings.js` catches key, triggers `switchFile(direction)`
3. JavaScript updates `data-active-file-index` on EditBuffer container
4. EditBuffer re-renders to show active file content

## Key Components

### FileFinderDialog
Pure component for file search UI (modal dialog).

### EditBuffer (Main Component)
Composes all sub-components following ChatThreadsBuffer pattern:
- FileTabsBar: Horizontal tab bar with close button
- FileContextBar: File metadata display
- FileContentView: Syntax highlighted content with line numbers

### fileService
Pure functions for file system operations.

### syntaxHighlighter
Pure functions for syntax highlighting.

## EditBuffer Component Structure (Close Button in Context Bar)

```tsx
// Based on ChatThreadsBuffer.tsx - close button moved to context bar
export const EditBuffer: FC<EditBufferProps> = ({
  sessionId,
  openFiles = [],          // like threads
  activeFilePath,          // like activeThreadId
}) => {
  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? openFiles[0];

  return (
    <div class="edit-buffer-container">
      {/* File Tabs Bar - like ChatThreadsBuffer tabs */}
      <div class="edit-buffer-tabs">
        {openFiles.map((file) => (
          <button class={`edit-file-tab ${file.path === activeFilePath ? "active" : ""}`}>
            {/* File icon based on language */}
            <span class="file-icon">{getFileIcon(file.language)}</span>
            {file.name}
          </button>
        ))}
        
        {/* Open file button - like "+ New Thread" */}
        <button id="open-file-finder-btn">+ Open File</button>
      </div>

      {/* File Context Bar - like Thread Context Bar with Close button */}
      {activeFile && (
        <div class="edit-file-context">
          <span>File: {activeFile.path}</span>
          <span>Lines: {activeFile.lineCount}</span>
          <span>Language: {activeFile.language}</span>
          
          {/* Spacer pushes close button to right */}
          <div style="flex: 1;"></div>
          
          {/* Close button - far right, like Delete in ChatThreadsBuffer */}
          <button id="close-file-btn" data-file-path={activeFile.path}>
            ✕ Close
          </button>
        </div>
      )}

      {/* File Content View - like Chat Messages Wrapper */}
      <div class="edit-file-content-wrapper">
        {activeFile ? (
          <FileContentView 
            content={activeFile.content}
            language={activeFile.language}
          />
        ) : (
          <div class="no-file-state">No file open. Press Mod+Shift+F to open a file.</div>
        )}
      </div>
    </div>
  );
};
```
