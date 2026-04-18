## Overview

This change connects chat and file navigation by making file-like text in agent (assistant) messages interactive. It also aligns matching behavior so explicit paths resolve first, while retaining a filename fallback for convenience.

## Design Decisions

### 1) File token rendering in chat

- Agent message content is split into lines; each line is scanned for file-like tokens rendered as button elements
- A `data-raw-text` attribute on the message content element preserves the original plain text for copy operations
- Rendering splits text by whitespace and wraps likely file references in a button element
- Token normalization strips trivial wrappers and line suffixes (for example `src/app.ts:42` -> `src/app.ts`)

### 2) Click behavior

- Chat container uses event delegation for `.chat-file-ref` clicks
- Click calls `window.EditBuffer.openFileFinder(query)`
- File finder receives the query, pre-fills the input, focuses it, and selects the text

### 3) Search ranking

Search results are ranked in this order:

1. exact path
2. absolute-path suffix match against relative repo path
3. path prefix match
4. path substring match
5. exact filename
6. filename prefix
7. filename substring

This ordering is implemented in both server-side filtering (`findFiles`) and client-side filtering in edit-buffer for consistent behavior.

## Risks

- Over-linking non-file tokens in chat text
  - Mitigated by conservative token checks (path separators or filename-like extension patterns)
- Different ordering between API and client
  - Mitigated by using equivalent ranking tiers in both places
