## Context

The mimo-platform has an existing fileFinder feature that searches filenames using an in-memory file list. This is fast but limited - users often need to find where a function is defined, where a variable is used, or locate specific error messages in code. Currently this requires leaving the editor to run terminal commands like `grep -r` or `ripgrep`.

**Existing Patterns:**
- fileFinder (Ctrl+P): Searches filenames, loads file list via `/sessions/:id/files`
- edit-buffer.js: Contains dialog management and keyboard handlers
- Expert mode: Has similar dialog patterns for file operations

**Constraints:**
- Must work within existing edit-buffer architecture
- Must handle large repositories gracefully
- Requires ripgrep binary on host system

## Goals / Non-Goals

**Goals:**
- Fast content search across all files in a session workspace
- Live search results with 300ms debounce
- Show file path, line number, and context (2 lines before/after)
- Highlight matching text in preview
- Keyboard navigation (Tab/Arrows + Enter)
- Open file at exact match position
- Clear error messages for invalid regex / no ripgrep

**Non-Goals:**
- Search within current file only (can reuse existing find)
- Project-wide search across multiple sessions
- Indexing or persistent search cache
- Replace functionality
- File content modification from search results

## Decisions

### 1. Use ripgrep as external process

**Decision:** Spawn ripgrep as child process rather than using Node.js file reading.

**Rationale:**
- ripgrep is 10-100x faster than native Node.js implementations
- Handles binary files, large files, and ignore patterns automatically
- JSON output format is easy to parse
- Already used by many developers, familiar interface

**Alternative considered:** Node.js recursive file reading with regex matching.
- Rejected: Too slow for large codebases, no built-in binary handling.

### 2. Separate dialog from fileFinder

**Decision:** Create entirely separate contentFinder dialog rather than extending fileFinder.

**Rationale:**
- Different UX patterns: filename matching vs content matching
- Different result structures: simple list vs rich cards with context
- fileFinder uses in-memory array; contentFinder needs backend search
- Allows different hotkeys and distinct mental models

**Alternative considered:** Unified search with toggle.
- Rejected: Would add UI complexity, different search semantics confusing.

### 3. Stream and parse ripgrep JSON output

**Decision:** Parse ripgrep's `--json` output line-by-line, building results incrementally.

**Rationale:**
- JSON format provides structured data: file, line, column, match text, submatches
- Can extract context lines before/after match
- Streaming parse allows early termination if we hit result limits

**JSON Structure:**
```json
{"type":"begin","data":{"path":{"text":"src/auth.ts"}}}
{"type":"context","data":{"path":{"text":"src/auth.ts"},"lines":{"text":"// setup\n"},"line_number":1}}
{"type":"match","data":{"path":{"text":"src/auth.ts"},"lines":{"text":"function validateToken() {}\n"},"line_number":2,"submatches":[{"match":{"text":"validateToken"},"start":9,"end":22}]}}
{"type":"end","data":{"path":{"text":"src/auth.ts"}}}
```

### 4. Hard result limits

**Decision:** Limit to 100 matches per search with truncation warning.

**Rationale:**
- Prevents UI freeze with broad searches (e.g., searching for "a")
- Keeps response fast even on huge codebases
- Most user searches are specific enough to fit in 100 results
- Display "Results truncated" when limit hit

### 5. Regex always, case insensitive

**Decision:** Treat all queries as regex patterns, case insensitive.

**Rationale:**
- Matches ripgrep default behavior
- Allows power users to use regex features
- Simple literal searches still work (most patterns don't use regex specials)
- No UI toggle keeps implementation simple

**Mitigation for literal searches:** Users can escape special chars: `foo\.bar`

## Risks / Trade-offs

**[Risk] ripgrep not installed on host system**
→ **Mitigation:** Check for rg binary on startup, show helpful install instructions if missing. Document as system requirement.

**[Risk] Very large repositories cause slow searches**
→ **Mitigation:** 300ms debounce prevents rapid-fire searches, 100 result limit caps response time. ripgrep is fast enough for most repos.

**[Risk] Invalid regex patterns from user**
→ **Mitigation:** Try-catch around ripgrep spawn, catch regex errors, show user-friendly message with escape hints.

**[Risk] Binary files producing garbage output**
→ **Mitigation:** ripgrep automatically skips binary files by default. No additional handling needed.

**[Risk] Concurrent searches overlapping**
→ **Mitigation:** Cancel previous search when new query starts. Use AbortController for fetch.

**[Trade-off] No search history**
→ Queries are ephemeral. Acceptable for v1, can add history later if needed.

## API Design

```typescript
// GET /sessions/:sessionId/search?q={query}&context={lines}

interface ContentSearchResult {
  path: string;           // Relative path from workspace
  line: number;           // 1-based line number
  column: number;         // 0-based byte offset
  text: string;           // Full line content
  matchStart: number;     // Start index in text
  matchEnd: number;       // End index in text
  before: string[];       // Lines before match
  after: string[];        // Lines after match
}

interface ContentSearchResponse {
  results: ContentSearchResult[];
  total: number;          // Total matches found
  truncated: boolean;     // True if hit result limit
}
```

## Service Interface

```typescript
// src/files/search-service.ts

export interface SearchService {
  searchContent(
    workspacePath: string,
    query: string,
    options: SearchOptions
  ): Promise<ContentSearchResult[]>;
}

export interface SearchOptions {
  contextLines: number;   // Lines before/after (default: 2)
  maxResults: number;     // Maximum results (default: 100)
}
```

## UI Mock

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 _________________                                    [Esc]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ src/auth/service.ts:42                                       │ │
│  │ // Token validation                                         │ │
│  │ function validateToken(token: string) {                     │ │
│  │   const decoded = jwt.verify(token, secret);                │ │
│  │   return decoded;                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ src/middleware/auth.ts:15                                  │ │
│  │ export function authMiddleware(req, res, next) {           │ │
│  │   const token = extractBearer(req);                          │ │
│  │   if (!validateToken(token)) {                             │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│                     47 matches in 12 files                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Files to Modify

1. **edit-buffer.js** - Add contentFinder dialog, keyboard handler for Alt+Shift+C
2. **sessions/routes.tsx** - Add GET /:id/search endpoint
3. **files/search-service.ts** - New file: ripgrep wrapper
4. **files/types.ts** - Add ContentSearchResult, SearchService interfaces
