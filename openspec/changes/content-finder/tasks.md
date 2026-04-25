## 1. Type Definitions

- [x] 1.1 Add ContentSearchResult interface to files/types.ts
- [x] 1.2 Add SearchService interface to files/types.ts
- [x] 1.3 Add SearchOptions interface to files/types.ts

## 2. Backend Service

- [x] 2.1 Create src/files/search-service.ts with ripgrep wrapper
- [x] 2.2 Implement spawnRipgrep function with JSON output parsing
- [x] 2.3 Implement parseRipgrepOutput to transform JSON to ContentSearchResult
- [x] 2.4 Add error handling for ripgrep not found
- [x] 2.5 Add error handling for invalid regex patterns
- [x] 2.6 Implement result limiting (100 results max) with truncation flag
- [x] 2.7 Add unit tests for search-service.ts

## 3. Backend API Route

- [x] 3.1 Add GET /:id/search endpoint to sessions/routes.tsx
- [x] 3.2 Integrate SearchService into FilesRoutesContext
- [x] 3.3 Implement query parameter parsing (q, context)
- [x] 3.4 Add validation for workspace access
- [x] 3.5 Format response with results array and metadata
- [x] 3.6 Add unit tests for search endpoint

## 4. Frontend Dialog UI

- [x] 4.1 Add HTML structure for content-finder-dialog in edit-buffer.html
- [x] 4.2 Add CSS styles for content finder dialog and results
- [x] 4.3 Implement openContentFinder() function
- [x] 4.4 Implement closeContentFinder() function
- [x] 4.5 Add keyboard shortcut handler for Alt+Shift+C
- [x] 4.6 Ensure Escape key closes the dialog

## 5. Frontend Search Logic

- [x] 5.1 Implement debounced search function (300ms)
- [x] 5.2 Implement fetchContentSearch API call
- [x] 5.3 Add AbortController to cancel in-flight requests
- [x] 5.4 Implement renderContentResults() with file path, line, context
- [x] 5.5 Add match highlighting in result previews
- [x] 5.6 Implement navigateContentResults() for Tab/Arrow keys
- [x] 5.7 Implement confirmContentSelection() to open file at match

## 6. Error Handling UI

- [x] 6.1 Show error state for invalid regex with helpful message
- [x] 6.2 Show error state for ripgrep not found with install instructions
- [x] 6.3 Show empty state when no results found
- [x] 6.4 Show "Searching..." indicator during debounce/wait
- [x] 6.5 Show "Results truncated" when hitting result limit

## 7. Integration

- [x] 7.1 Wire up search endpoint to use SearchService
- [x] 7.2 Ensure dialog integrates with existing edit-buffer state
- [x] 7.3 Test file opening scrolls to correct line
- [x] 7.4 Test keyboard navigation works with existing fileFinder

## 8. Testing

- [x] 8.1 Run existing test suite to ensure no regressions
- [ ] 8.2 Test on small repository (<100 files)
- [ ] 8.3 Test on medium repository (1000-10000 files)
- [ ] 8.4 Test error states (invalid regex, no ripgrep)
- [ ] 8.5 Verify keyboard shortcuts don't conflict
